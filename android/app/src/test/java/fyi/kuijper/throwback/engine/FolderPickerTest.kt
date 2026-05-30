package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.Crumb
import fyi.kuijper.throwback.onedrive.GraphClient
import fyi.kuijper.throwback.onedrive.GraphHttp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Proves the folder picker is testable apart from [fyi.kuijper.throwback.MainViewModel]: fed a fake
 * [GraphHttp], the whole browse logic runs without network or UI. [Dispatchers.Unconfined] runs the
 * fetch launch synchronously, so the state is set immediately after an intent.
 */
class FolderPickerTest {

    private class FakeGraphHttp(private val pages: Map<String, JSONObject>) : GraphHttp {
        override suspend fun getJson(pathOrUrl: String): JSONObject =
            pages[pathOrUrl] ?: error("onbekende URL: $pathOrUrl")
        override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = pages[pathOrUrl]
        override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = null
    }

    private fun json(s: String) = JSONObject(s.trimIndent())

    private val fake = FakeGraphHttp(
        mapOf(
            "/me/drive/root/children?%24select=id,name,folder&%24top=200" to json(
                """{"value":[
                     {"id":"y2019","name":"2019","folder":{"childCount":3}},
                     {"id":"y2018","name":"2018","folder":{"childCount":2}}
                   ]}"""
            ),
            "/me/drive/items/y2019/children?%24select=id,name,folder&%24top=200" to json(
                """{"value":[{"id":"ev","name":"Bruiloft","folder":{"childCount":5}}]}"""
            ),
            // cameraroll and photos point at the same id → suggestions must dedupe.
            "/me/drive/special/cameraroll?%24select=id,name,folder" to json(
                """{"id":"cam","name":"Camera Roll","folder":{"childCount":100}}"""
            ),
            "/me/drive/special/photos?%24select=id,name,folder" to json(
                """{"id":"cam","name":"Photos","folder":{"childCount":100}}"""
            ),
        )
    )

    private fun newPicker() = FolderPicker(GraphClient(fake), CoroutineScope(Dispatchers.Unconfined)) { throw it }

    @Test
    fun `openRoot toont gesorteerde rootmappen plus gededupliceerde voorgestelde fotomappen`() {
        val picker = newPicker()
        picker.openRoot()

        val s = picker.state.value
        assertEquals(listOf("OneDrive"), s.path.map { it.name })
        assertEquals(listOf("2018", "2019"), s.folders.map { it.name }) // sorted by name
        assertEquals(listOf("Camera-album"), s.suggestions.map { it.name }) // cameraroll+photos share id
        assertTrue(!s.loading)
    }

    @Test
    fun `open daalt af in een submap (zonder voorstellen) en back keert terug`() {
        val picker = newPicker()
        picker.openRoot()

        picker.open(Crumb("y2019", "2019"))
        assertEquals(listOf("OneDrive", "2019"), picker.state.value.path.map { it.name })
        assertEquals(listOf("Bruiloft"), picker.state.value.folders.map { it.name })
        assertTrue("voorstellen alleen op rootniveau", picker.state.value.suggestions.isEmpty())

        picker.back()
        assertEquals(listOf("OneDrive"), picker.state.value.path.map { it.name })
    }

    @Test
    fun `chooseCurrent weigert de root maar levert een echte submap`() {
        val picker = newPicker()
        picker.openRoot()
        assertNull("de OneDrive-root (id null) is niet kiesbaar", picker.chooseCurrent())

        picker.open(Crumb("y2019", "2019"))
        assertEquals(Crumb("y2019", "2019"), picker.chooseCurrent())
    }
}
