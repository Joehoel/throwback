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
        // Custom sizes come back as a property named after the size, not a bare top-level `url`.
        val media = GraphMedia(FakeGraphHttp { JSONObject("""{"c1920x1920":{"url":"https://cdn/x.jpg"}}""") })
        assertEquals("https://cdn/x.jpg", media.thumbnailUrl("p1"))
    }

    @Test
    fun `vraagt een TV-formaat thumbnail via select (geen path-segment, geen kleine 'large')`() = runBlocking {
        // Locks in the quality decision (ADR-0004 "~1920px"): a regression back to the predefined
        // `large` (≤800px) upscales hard on a 1080p/4K panel. And it pins the addressing: a custom
        // size MUST go through `$select` — as a path segment Graph rejects the whole OData path.
        var requested: String? = null
        val media = GraphMedia(FakeGraphHttp { path ->
            requested = path
            JSONObject("""{"c1920x1920":{"url":"https://cdn/x.jpg"}}""")
        })
        media.thumbnailUrl("p1")
        assertEquals("/me/drive/items/p1/thumbnails/0?\$select=c1920x1920", requested)
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
