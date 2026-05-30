package fyi.kuijper.throwback.onedrive

/**
 * Pure (Android-free) composition of the place caption from address fields, so it is unit-testable on
 * its own. See [PlaceResolver] for the Geocoder side.
 *
 * Country is included only when it differs from [homeCountryCode]; junk street values ("Unnamed Road")
 * are dropped; null when nothing usable remains.
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
