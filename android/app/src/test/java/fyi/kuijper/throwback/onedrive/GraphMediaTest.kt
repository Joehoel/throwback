package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GraphMediaTest {

    /** Nep-transport: één lambda bepaalt wat een GET teruggeeft (of `null` = 404). */
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
        // 404 → getJsonOrNull geeft null; legitiem afwezig, geen fout.
        val media = GraphMedia(FakeGraphHttp { null })
        assertNull(media.thumbnailUrl("p1"))
    }

    @Test
    fun `slikt een transiente fout niet in maar laat 'm door`() {
        // De oude GraphMedia gaf bij élke fout null ("geen thumbnail"). Nu propageert een 503,
        // zodat de aanroeper (SlideshowEngine) bewust kan beslissen te degraderen.
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
