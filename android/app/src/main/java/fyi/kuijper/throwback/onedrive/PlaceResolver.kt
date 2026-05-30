package fyi.kuijper.throwback.onedrive

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import androidx.annotation.RequiresApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Turns photo GPS into a readable caption label at *index* time (not per display). Reverse-geocodes via
 * the built-in [Geocoder] with a cache keyed on (~1 m rounded) coordinates, so repeated lookups of the
 * same location are free. Clustering photos to one lookup per event happens a layer up (see [GeoCluster]).
 *
 * On Android 13+ this uses the non-blocking listener API so the caller can run several lookups at once;
 * older devices fall back to the synchronous API on an IO thread. Label composition lives in [PlaceLabel].
 */
class PlaceResolver(
    context: Context,
    private val locale: Locale = Locale("nl", "NL"),
    private val homeCountryCode: String = "NL",
) {
    private val appContext = context.applicationContext
    // "" = looked up but nothing usable (negative cache), so we stop retrying.
    private val cache = ConcurrentHashMap<String, String>()

    suspend fun resolve(lat: Double, lon: Double): String? {
        if (!Geocoder.isPresent()) return null
        val key = key(lat, lon)
        cache[key]?.let { return it.ifBlank { null } }
        // Transient errors (rate-limit / "Service not Available") are not cached so a later pass retries;
        // a successful lookup (including "no address") is cached.
        val label = runCatching { addressLabel(lat, lon) }.getOrElse { return null }
        cache[key] = label ?: ""
        return label
    }

    private suspend fun addressLabel(lat: Double, lon: Double): String? =
        firstAddress(lat, lon)?.let(::labelOf)

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

    // 5 decimals ~= 1 m, finer than consumer GPS, so the cache only dedups truly identical coordinates
    // (e.g. the same photo). The coarser per-event grouping is done by [GeoCluster].
    private fun key(lat: Double, lon: Double) = formatCoord(lat, lon, 5)

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
