package fyi.kuijper.throwback.onedrive

import fyi.kuijper.throwback.core.HomeCountryCode

/**
 * Pure (Android-free) composition of the place caption from address fields, so it is unit-testable on
 * its own. See [PlaceResolver] for the Geocoder side.
 *
 * Country is included only when it differs from [homeCountryCode]; junk street values ("Unnamed Road")
 * are dropped; null when nothing usable remains.
 */
internal object PlaceLabel {
    private val JUNK_STREETS = setOf("unnamed road")

    fun compose(
        thoroughfare: String?,
        subThoroughfare: String?,
        locality: String?,
        subAdminArea: String?,
        adminArea: String?,
        countryName: String?,
        countryCode: String?,
        homeCountryCode: String = HomeCountryCode,
    ): String? {
        val road = thoroughfare.trimToNull()?.takeUnless { it.lowercase() in JUNK_STREETS }
        val street = road?.let { r -> subThoroughfare.trimToNull()?.let { "$r $it" } ?: r }
        val city = locality.trimToNull() ?: subAdminArea.trimToNull() ?: adminArea.trimToNull()
        val country = countryName.trimToNull()
            ?.takeUnless { countryCode.trimToNull()?.equals(homeCountryCode, ignoreCase = true) == true }
        return listOfNotNull(street, city, country).joinToString(", ").ifBlank { null }
    }
}
