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
 * Zet GPS uit de fotometadata om naar een leesbaar bijschrift-label, bij het *indexeren* (niet per
 * weergave). Reverse-geocodet via de ingebouwde [Geocoder] met een cache op (op ~1 m afgeronde)
 * coördinaten, zodat herhaalde opzoekingen van dezelfde locatie gratis zijn. Het clusteren van foto's
 * tot één opzoeking per gebeurtenis gebeurt een laag hoger (zie [GeoCluster] / SyncEngine).
 *
 * Op Android 13+ gebruikt dit de niet-blokkerende listener-API, zodat de aanroeper meerdere lookups
 * tegelijk kan laten lopen; op oudere toestellen valt het terug op de synchrone API (op een IO-thread).
 *
 * Label: straat (+ huisnummer indien aanwezig), plaats, en het land alleen als het niet
 * [homeCountryCode] is. Zinloze straatwaarden ("Unnamed Road") worden weggelaten; ontbreekt alles,
 * dan null (we tonen dan geen locatie). De labelopbouw zit in [PlaceLabel] — puur en unit-testbaar.
 */
class PlaceResolver(
    context: Context,
    private val locale: Locale = Locale("nl", "NL"),
    private val homeCountryCode: String = "NL",
) {
    private val appContext = context.applicationContext
    // "" = opgezocht maar niets bruikbaars (negatieve cache), zodat we niet blijven herproberen.
    private val cache = ConcurrentHashMap<String, String>()

    suspend fun resolve(lat: Double, lon: Double): String? {
        if (!Geocoder.isPresent()) return null
        val key = key(lat, lon)
        cache[key]?.let { return it.ifBlank { null } }
        // Tijdelijke fout (rate-limit / "Service not Available"): niét cachen, zodat een latere pass
        // het opnieuw probeert. Een geslaagde lookup (incl. "geen adres") cachen we wél.
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

    // 5 decimalen ≈ 1 m — fijner dan consumenten-GPS, dus de cache dedupt alleen écht identieke
    // coördinaten (bv. dezelfde foto). Het grovere groeperen per gebeurtenis doet [GeoCluster].
    private fun key(lat: Double, lon: Double) = "%.5f,%.5f".format(Locale.US, lat, lon)

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
