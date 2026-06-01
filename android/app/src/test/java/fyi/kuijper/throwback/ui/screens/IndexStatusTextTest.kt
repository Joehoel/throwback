package fyi.kuijper.throwback.ui.screens

import fyi.kuijper.throwback.UiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pure status-line logic for the two index rows (indexing + geocoding) under the Settings title. */
class IndexStatusTextTest {

    private fun settings(
        indexed: Int = 0,
        processed: Int = 0,
        total: Int = 0,
        located: Int = 0,
        geocoded: Int = 0,
        indexing: Boolean = false,
        syncError: String? = null,
    ) = UiState.Settings(
        slideSeconds = 8, shuffle = true, captionEnabled = true,
        indexed = indexed, processed = processed, total = total, located = located, geocoded = geocoded,
        indexing = indexing, syncError = syncError,
    )

    @Test fun `nothing indexed and idle shows nothing`() {
        assertNull(indexStatusText(settings()))
    }

    @Test fun `idle with photos shows the indexed count`() {
        assertEquals("1.234 foto's geïndexeerd", indexStatusText(settings(indexed = 1234)))
    }

    @Test fun `indexing shows this run's progress over the total`() {
        assertEquals(
            "Indexeren… 120 / 480 foto's",
            indexStatusText(settings(indexed = 480, processed = 120, total = 480, indexing = true)),
        )
    }

    @Test fun `indexing before the first batch shows updating`() {
        assertEquals("Bibliotheek bijwerken…", indexStatusText(settings(indexing = true)))
    }

    @Test fun `idle with sync error reports the failure`() {
        assertEquals("480 foto's · laatste verversing mislukt", indexStatusText(settings(indexed = 480, syncError = "boom")))
    }

    @Test fun `no geolocated photos hides the geocode row`() {
        assertNull(geocodeStatusText(settings(indexed = 480, located = 0)))
    }

    @Test fun `geocode row shows progress over the located photos`() {
        assertEquals("312 van 480 met locatie", geocodeStatusText(settings(located = 480, geocoded = 312)))
    }
}
