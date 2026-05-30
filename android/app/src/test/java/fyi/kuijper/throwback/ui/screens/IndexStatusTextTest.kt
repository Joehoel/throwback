package fyi.kuijper.throwback.ui.screens

import fyi.kuijper.throwback.UiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IndexStatusTextTest {

    private fun settings(
        indexed: Int = 0,
        processed: Int = 0,
        indexing: Boolean = false,
        syncError: String? = null,
    ) = UiState.Settings(
        slideSeconds = 8, shuffle = true, captionEnabled = true,
        indexed = indexed, processed = processed, indexing = indexing, syncError = syncError,
    )

    @Test
    fun `nothing indexed and idle shows nothing`() {
        assertNull(indexStatusText(settings()))
    }

    @Test
    fun `full crawl with known total shows processed over total`() {
        assertEquals(
            "Indexeren… 40 / 100 foto's",
            indexStatusText(settings(indexed = 100, processed = 40, indexing = true)),
        )
    }

    @Test
    fun `first crawl without known total shows running count`() {
        assertEquals(
            "Indexeren… 40 foto's",
            indexStatusText(settings(indexed = 40, processed = 40, indexing = true)),
        )
    }

    @Test
    fun `indexing without progress shows updating`() {
        assertEquals("Bibliotheek bijwerken…", indexStatusText(settings(indexing = true)))
    }

    @Test
    fun `idle with sync error reports the failure`() {
        assertEquals(
            "12 foto's · laatste verversing mislukt",
            indexStatusText(settings(indexed = 12, syncError = "boom")),
        )
    }

    @Test
    fun `idle with photos shows the indexed count`() {
        assertEquals("1.234 foto's geïndexeerd", indexStatusText(settings(indexed = 1234)))
    }
}
