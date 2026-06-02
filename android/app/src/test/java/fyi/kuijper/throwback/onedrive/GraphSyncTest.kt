package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GraphSyncTest {

    /** Fake transport: canned JSON per URL. `paginate` (interface default) comes along for free. */
    private class FakeGraphHttp(private val pages: Map<String, JSONObject>) : GraphHttp {
        /** Records every content-GET window so a test can assert the head slice is big enough. */
        val byteCounts = mutableListOf<Int>()
        override suspend fun getJson(pathOrUrl: String): JSONObject =
            pages[pathOrUrl] ?: error("onbekende URL: $pathOrUrl")
        override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = pages[pathOrUrl]
        override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? {
            byteCounts += byteCount
            return null
        }
    }

    private fun json(s: String) = JSONObject(s.trimIndent())
    private val select = "id,name,description,folder,file,photo,location,parentReference"

    @Test
    fun `refresh loopt delta-paginatie af, splitst wijzigingen van verwijderingen, en haalt het nieuwe token op`() = runBlocking {
        val http = FakeGraphHttp(
            mapOf(
                // Delta page 1: a changed photo + a deletion, then nextLink.
                "https://g/delta1" to json(
                    """{"value":[
                         {"id":"p1","photo":{}},
                         {"id":"gone","deleted":{}}
                       ],"@odata.nextLink":"https://g/delta2"}"""
                ),
                // Page 2: another changed photo, and the fresh delta token at the end.
                "https://g/delta2" to json(
                    """{"value":[
                         {"id":"p2","file":{"mimeType":"image/png"}}
                       ],"@odata.deltaLink":"https://g/newtoken"}"""
                ),
                // Delta omits description → a full GET per changed item.
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

    @Test
    fun `de EXIF-headslice dekt een volledig EXIF-segment (64 KB)`() = runBlocking {
        // Regressie: een camera-JPEG bewaart een thumbnail in EXIF, dus dat APP1-segment loopt op tot
        // de 64 KB-limiet van één marker; ExifInterface leest niets uit een *afgekapt* segment. Een te
        // kleine head-slice (ooit 32 KB) liet zo elk ingebed bijschrift verdwijnen. De content-GET moet
        // minstens een heel EXIF-segment kunnen bevatten.
        val http = FakeGraphHttp(
            mapOf(
                "https://g/delta1" to json("""{"value":[{"id":"p1","photo":{}}],"@odata.deltaLink":"https://g/t"}"""),
                // description weggelaten → de EXIF-fallback haalt de head-slice op.
                "/me/drive/items/p1?%24select=$select" to json(
                    """{"id":"p1","name":"IMGP1636.jpg","file":{"mimeType":"image/jpeg"},
                        "parentReference":{"path":"/drive/root:/F/2009/Vakantie"}}"""
                ),
            )
        )

        GraphSync(http).refresh("https://g/delta1")

        val window = http.byteCounts.singleOrNull()
            ?: error("verwachtte precies één content-GET, kreeg ${http.byteCounts}")
        assertTrue("head-slice ($window B) moet ≥ 64 KB zijn om een vol EXIF-segment te dekken",
            window >= 64 * 1024)
    }
}
