package fyi.kuijper.throwback.onedrive

/**
 * Pure (Android-vrije) opbouw van het plaats-bijschrift uit losse adresvelden, zodat het los
 * unit-testbaar is. Zie [PlaceResolver] voor de Geocoder-kant.
 *
 * Regels: straat (+ huisnummer indien aanwezig), plaats, en het land alleen als het niet
 * [homeCountryCode] is. Zinloze straatwaarden ("Unnamed Road") vallen weg; is er niets, dan null.
 */
object PlaceLabel {
    private val JUNK_STREETS = setOf("unnamed road")

    fun compose(
        thoroughfare: String?,
        subThoroughfare: String?,
        locality: String?,
        subAdminArea: String?,
        adminArea: String?,
        countryName: String?,
        countryCode: String?,
        homeCountryCode: String = "NL",
    ): String? {
        fun String?.norm() = this?.trim()?.ifBlank { null }
        val road = thoroughfare.norm()?.takeUnless { it.lowercase() in JUNK_STREETS }
        val street = road?.let { r -> subThoroughfare.norm()?.let { "$r $it" } ?: r }
        val city = locality.norm() ?: subAdminArea.norm() ?: adminArea.norm()
        val country = countryName.norm()
            ?.takeUnless { countryCode.norm()?.equals(homeCountryCode, ignoreCase = true) == true }
        return listOfNotNull(street, city, country).joinToString(", ").ifBlank { null }
    }
}
