package fyi.kuijper.throwback.onedrive

import android.content.Context
import android.location.Address
import android.location.Geocoder
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Zet GPS uit de fotometadata om naar een leesbaar bijschrift-label, bij het *indexeren* (niet per
 * weergave). Reverse-geocodet via de ingebouwde [Geocoder] op een achtergrond-thread, met een cache
 * op afgeronde coördinaten zodat 800 foto's van dezelfde locatie één opzoeking delen.
 *
 * Label: straat (+ huisnummer indien aanwezig), plaats, en het land alleen als het niet
 * [homeCountryCode] is. Zinloze straatwaarden ("Unnamed Road") worden weggelaten; ontbreekt alles,
 * dan null (we tonen dan geen locatie). De labelopbouw zit in [composeLabel] — puur en unit-testbaar.
 */
class PlaceResolver(
    context: Context,
    private val locale: Locale = Locale("nl", "NL"),
    private val homeCountryCode: String = "NL",
) {
    private val appContext = context.applicationContext
    // "" = opgezocht maar niets bruikbaars (negatieve cache), zodat we niet blijven herproberen.
    private val cache = ConcurrentHashMap<String, String>()

    fun resolve(lat: Double, lon: Double): String? {
        if (!Geocoder.isPresent()) return null
        val key = "%.3f,%.3f".format(Locale.US, lat, lon)
        cache[key]?.let { return it.ifBlank { null } }
        val label = runCatching {
            @Suppress("DEPRECATION")
            Geocoder(appContext, locale).getFromLocation(lat, lon, 1)?.firstOrNull()?.let(::labelOf)
        }.getOrNull()
        cache[key] = label ?: ""
        return label
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
