package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaceLabelTest {

    private fun label(
        thoroughfare: String? = null,
        locality: String? = null,
        subAdminArea: String? = null,
        adminArea: String? = null,
        countryName: String? = null,
        countryCode: String? = null,
    ) = PlaceLabel.compose(thoroughfare, locality, subAdminArea, adminArea, countryName, countryCode)

    @Test fun `street is shown without the house number`() {
        // subThoroughfare (house number) is intentionally not part of the label.
        assertEquals(
            "Dorpsstraat, Urk",
            label(thoroughfare = "Dorpsstraat", locality = "Urk", countryName = "Netherlands", countryCode = "NL"),
        )
    }

    @Test fun `unnamed road is dropped (photo in a lake)`() {
        assertEquals("Lemmer", label(thoroughfare = "Unnamed Road", locality = "Lemmer", countryCode = "NL"))
    }

    @Test fun `country shown only when abroad`() {
        assertEquals("Jeruzalem, Israël", label(locality = "Jeruzalem", countryName = "Israël", countryCode = "IL"))
        assertEquals("Apeldoorn", label(locality = "Apeldoorn", countryName = "Netherlands", countryCode = "NL"))
    }

    @Test fun `falls back to admin area when no locality`() {
        assertEquals("Flevoland", label(adminArea = "Flevoland", countryCode = "NL"))
    }

    @Test fun `blank and missing yields null`() {
        assertNull(label())
        assertNull(label(thoroughfare = "Unnamed Road", locality = "  "))
    }
}
