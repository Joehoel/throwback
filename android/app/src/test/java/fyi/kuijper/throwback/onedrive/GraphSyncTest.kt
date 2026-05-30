package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GraphSyncTest {

    /** Nep-transport: ingeblikte JSON per URL. `paginate` (interface-default) loopt vanzelf mee. */
    private class FakeGraphHttp(private val pages: Map<String, JSONObject>) : GraphHttp {
        override suspend fun getJson(pathOrUrl: String): JSONObject =
            pages[pathOrUrl] ?: error("onbekende URL: $pathOrUrl")
        override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = pages[pathOrUrl]
        override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = null
    }

    private fun json(s: String) = JSONObject(s.trimIndent())
    private val select = "id,name,description,folder,file,photo,location,parentReference"

    @Test
    fun `refresh loopt delta-paginatie af, splitst wijzigingen van verwijderingen, en haalt het nieuwe token op`() = runBlocking {
        val http = FakeGraphHttp(
            mapOf(
                // Pagina 1 van de delta: een gewijzigde foto + een verwijdering, dan nextLink.
                "https://g/delta1" to json(
                    """{"value":[
                         {"id":"p1","photo":{}},
                         {"id":"gone","deleted":{}}
                       ],"@odata.nextLink":"https://g/delta2"}"""
                ),
                // Pagina 2: nog een gewijzigde foto, en het verse delta-token aan het eind.
                "https://g/delta2" to json(
                    """{"value":[
                         {"id":"p2","file":{"mimeType":"image/png"}}
                       ],"@odata.deltaLink":"https://g/newtoken"}"""
                ),
                // Delta geeft geen description → per gewijzigd item een volledige GET.
                "/me/drive/items/p1?%24select=$select" to json(
                    """{"id":"p1","name":"a.jpg","description":"Dans","file":{"mimeType":"image/jpeg"},
                        "parentReference":{"path":"/drive/root:/F/2019/Bruiloft"}}"""
                ),
                "/me/drive/items/p2?%24select=$select" to json(
                    """{"id":"p2","name":"b.png","description":"Zomer","file":{"mimeType":"image/png"},
                        "parentReference":{"path":"/drive/root:/F/2020/Vakantie"}}"""
                ),
            )
        )

        val changes = GraphSync(http).refresh("https://g/delta1")

        assertEquals(listOf("gone"), changes.deletedIds)
        assertEquals("https://g/newtoken", changes.newDeltaLink)
        assertEquals(listOf("p1", "p2"), changes.upserts.map { it.id })
        assertEquals("Dans", changes.upserts[0].description)
        assertEquals(2019, changes.upserts[0].year)
        assertEquals("Bruiloft", changes.upserts[0].event)
        assertEquals(2020, changes.upserts[1].year)
    }

    @Test
    fun `initDeltaToken pakt het delta-token van de laatste pagina, over paginatie heen`() = runBlocking {
        val http = FakeGraphHttp(
            mapOf(
                "/me/drive/items/root/delta?token=latest" to json(
                    """{"value":[],"@odata.nextLink":"https://g/more"}"""
                ),
                "https://g/more" to json(
                    """{"value":[],"@odata.deltaLink":"https://g/token-na-paginatie"}"""
                ),
            )
        )

        assertEquals("https://g/token-na-paginatie", GraphSync(http).initDeltaToken("root"))
    }

    @Test
    fun `initDeltaToken geeft null als er geen token komt`() = runBlocking {
        val http = FakeGraphHttp(
            mapOf("/me/drive/items/root/delta?token=latest" to json("""{"value":[]}"""))
        )
        assertNull(GraphSync(http).initDeltaToken("root"))
    }
}
