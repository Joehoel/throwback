package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GraphMediaTest {

    /** Fake transport: one lambda decides what a GET returns (or `null` = 404). */
    private class FakeGraphHttp(private val onGet: (String) -> JSONObject?) : GraphHttp {
        override suspend fun getJson(pathOrUrl: String): JSONObject =
            onGet(pathOrUrl) ?: error("404 — $pathOrUrl")
        override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = onGet(pathOrUrl)
        override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = null
    }

    @Test
    fun `geeft de thumbnail-URL terug`() = runBlocking {
        val media = GraphMedia(FakeGraphHttp { JSONObject("""{"url":"https://cdn/x.jpg"}""") })
        assertEquals("https://cdn/x.jpg", media.thumbnailUrl("p1"))
    }

    @Test
    fun `geeft null als de thumbnail (nog) niet bestaat`() = runBlocking {
        // 404 → getJsonOrNull returns null; legitimately absent, not an error.
        val media = GraphMedia(FakeGraphHttp { null })
        assertNull(media.thumbnailUrl("p1"))
    }

    @Test
    fun `slikt een transiente fout niet in maar laat 'm door`() {
        // The old GraphMedia returned null on any error. Now a 503 propagates, so the caller
        // (SlideshowEngine) can deliberately decide to degrade.
        val media = GraphMedia(object : GraphHttp {
            override suspend fun getJson(pathOrUrl: String) = error("Graph-fout 503")
            override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = error("Graph-fout 503")
            override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = null
        })
        var threw = false
        try {
            runBlocking { media.thumbnailUrl("p1") }
        } catch (e: IllegalStateException) {
            threw = true
        }
        assertTrue("een transiente Graph-fout hoort door te propageren, niet als null te verdwijnen", threw)
    }
}
