package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class GraphCrawlerTest {

    private fun item(json: String) = JSONObject(json.trimIndent())

    @Test
    fun `crawlt recursief en levert foto's met gebeurtenis en jaar, documenten overslaand`() = runBlocking {
        // Fake tree: root → 2019 → Bruiloft → (photo + pdf)
        val tree = mapOf(
            "root" to listOf(item("""{"id":"y2019","name":"2019","folder":{"childCount":1}}""")),
            "y2019" to listOf(item("""{"id":"ev","name":"Bruiloft","folder":{"childCount":2}}""")),
            "ev" to listOf(
                item("""{"id":"p1","name":"a.jpg","description":"Dans","file":{"mimeType":"image/jpeg"},
                         "parentReference":{"path":"/drive/root:/Foto's/2019/Bruiloft"}}"""),
                item("""{"id":"d1","name":"draaiboek.pdf","file":{"mimeType":"application/pdf"},
                         "parentReference":{"path":"/drive/root:/Foto's/2019/Bruiloft"}}"""),
            ),
        )
        val crawler = GraphCrawler { id -> tree[id] ?: emptyList() }

        val rows = ArrayList<PhotoRow>()
        crawler.crawl("root") { rows.addAll(it) }

        assertEquals(1, rows.size)
        assertEquals("p1", rows[0].id)
        assertEquals("Bruiloft", rows[0].event)
        assertEquals(2019, rows[0].year)
        assertEquals("Dans", rows[0].description)
    }

    @Test
    fun `loopt meerdere takken af (twee jaren, twee gebeurtenissen)`() = runBlocking {
        val tree = mapOf(
            "root" to listOf(
                item("""{"id":"y18","name":"2018","folder":{}}"""),
                item("""{"id":"y19","name":"2019","folder":{}}"""),
            ),
            "y18" to listOf(item("""{"id":"a.jpg","name":"a.jpg","file":{"mimeType":"image/jpeg"},
                                     "parentReference":{"path":"/drive/root:/F/2018/Kerst"}}""")),
            "y19" to listOf(item("""{"id":"b.jpg","name":"b.jpg","file":{"mimeType":"image/png"},
                                     "parentReference":{"path":"/drive/root:/F/2019/Zomer"}}""")),
        )
        val crawler = GraphCrawler { id -> tree[id] ?: emptyList() }

        val rows = ArrayList<PhotoRow>()
        crawler.crawl("root") { rows.addAll(it) }

        assertEquals(2, rows.size)
        assertEquals(setOf("Kerst", "Zomer"), rows.map { it.event }.toSet())
        assertEquals(setOf(2018, 2019), rows.mapNotNull { it.year }.toSet())
    }
}
