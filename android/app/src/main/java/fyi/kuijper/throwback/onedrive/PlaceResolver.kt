package fyi.kuijper.throwback.onedrive

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import androidx.annotation.RequiresApi
import fyi.kuijper.throwback.core.AppLocale
import fyi.kuijper.throwback.core.HomeCountryCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Turns photo GPS into readable place labels at *index* time (not per display). Owns the whole
 * geocoding policy: it skips photos without GPS or already labelled, clusters the rest by
 * Gebeurtenis + coarse cell ([GeoCluster]) so each location is looked up once, runs the lookups in
 * parallel (bounded by [MAX_CONCURRENT_LOOKUPS]), caches per (~1 m) coordinate, and composes the
 * label ([PlaceLabel]). The single-coordinate reverse-geocode ([geocodeOne]) is injectable, so the
 * clustering/cache policy is unit-testable without Android's [Geocoder].
 *
 * [resolve] returns id -> label for every photo it could place; a failed or empty lookup simply
 * leaves that photo out, so a later pass retries it.
 */
class PlaceResolver internal constructor(
    private val geocodeOne: suspend (lat: Double, lon: Double) -> String?,
) {
    constructor(
        context: Context,
        locale: Locale = AppLocale,
        homeCountryCode: String = HomeCountryCode,
    ) : this(AndroidGeocoder(context.applicationContext, locale, homeCountryCode)::label)

    // "" = looked up but nothing usable (negative cache), so we stop retrying that coordinate.
    private val cache = ConcurrentHashMap<String, String>()

    /** Reverse-geocode a batch; returns id -> place label for the photos it could place. */
    suspend fun resolve(photos: List<PhotoRow>): Map<String, String> {
        val located = photos.filter { it.lat != null && it.lon != null && it.place == null }
        if (located.isEmpty()) return emptyMap()
        val clusters = located.groupBy { GeoCluster.keyOf(it.event, it.lat!!, it.lon!!) }
        return coroutineScope {
            val gate = Semaphore(MAX_CONCURRENT_LOOKUPS)
            clusters.values.map { members ->
                async {
                    if (!currentCoroutineContext().isActive) return@async emptyList<Pair<String, String>>()
                    gate.withPermit {
                        val rep = members.first()
                        val label = cachedLabel(rep.lat!!, rep.lon!!) ?: return@withPermit emptyList()
                        members.map { it.id to label }
                    }
                }
            }.awaitAll().flatten().toMap()
        }
    }

    private suspend fun cachedLabel(lat: Double, lon: Double): String? {
        // 5 decimals ~= 1 m, finer than consumer GPS, so the cache only dedups truly identical
        // coordinates; the coarser per-event grouping is done by [GeoCluster].
        val key = formatCoord(lat, lon, 5)
        cache[key]?.let { return it.ifBlank { null } }
        // Transient errors (rate-limit / "Service not Available") throw and are not cached, so a later
        // pass retries; a successful lookup (including "no usable address" -> null) is cached.
        val label = runCatching { geocodeOne(lat, lon) }.getOrElse { return null }
        cache[key] = label ?: ""
        return label
    }

    private companion object {
        const val MAX_CONCURRENT_LOOKUPS = 6
    }
}

/**
 * The Android leaf: one reverse-geocode via the built-in [Geocoder], composed into a label by
 * [PlaceLabel]. On Android 13+ this uses the non-blocking listener API (so several can run at once);
 * older devices fall back to the synchronous API on an IO thread. Returns null when nothing usable
 * comes back; throws on a transient geocoder error so [PlaceResolver] can avoid caching it.
 */
private class AndroidGeocoder(
    private val appContext: Context,
    private val locale: Locale,
    private val homeCountryCode: String,
) {
    suspend fun label(lat: Double, lon: Double): String? {
        if (!Geocoder.isPresent()) return null
        return firstAddress(lat, lon)?.let(::labelOf)
    }

    private suspend fun firstAddress(lat: Double, lon: Double): Address? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            addressesAsync(lat, lon).firstOrNull()
        } else {
            withContext(Dispatchers.IO) {
                @Suppress("DEPRECATION")
                Geocoder(appContext, locale).getFromLocation(lat, lon, 1)?.firstOrNull()
            }
        }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private suspend fun addressesAsync(lat: Double, lon: Double): List<Address> =
        suspendCancellableCoroutine { cont ->
            Geocoder(appContext, locale).getFromLocation(lat, lon, 1, object : Geocoder.GeocodeListener {
                override fun onGeocode(addresses: MutableList<Address>) = cont.resume(addresses)
                override fun onError(errorMessage: String?) =
                    cont.resumeWithException(IOException(errorMessage ?: "geocode error"))
            })
        }

    private fun labelOf(a: Address): String? = PlaceLabel.compose(
        thoroughfare = a.thoroughfare,
        subThoroughfare = a.subThoroughfare,
        locality = a.locality,
        subAdminArea = a.subAdminArea,
        adminArea = a.adminArea,
        countryName = a.countryName,
        countryCode = a.countryCode,
        homeCountryCode = homeCountryCode,
    )
}
