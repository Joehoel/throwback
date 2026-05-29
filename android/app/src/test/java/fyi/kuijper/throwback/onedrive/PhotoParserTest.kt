package fyi.kuijper.throwback.onedrive

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PhotoParserTest {

    private fun item(json: String) = JSONObject(json.trimIndent())

    @Test
    fun `pakt naam en beschrijving uit een children-item`() {
        val json = item(
            """
            {"id":"A1","name":"oma.heic","description":"Oma 80 jaar",
             "file":{"mimeType":"image/heic"},
             "photo":{"takenDateTime":"2019-07-06T12:00:00Z"}}
            """
        )
        val row = PhotoParser.toPhotoRow("/drive/root:/Foto's/2019/07/Bruiloft Anne & Tom", json)
        assertNotNull(row)
        assertEquals("oma.heic", row!!.name)
        assertEquals("Oma 80 jaar", row.description)
        assertEquals("Bruiloft Anne & Tom", row.event)
    }

    @Test
    fun `jaar komt uit de jaar-map, niet uit EXIF (ingescande foto)`() {
        // Map zegt 1998, EXIF zegt 2020 (scandatum). De map is leidend (ADR-0002).
        val json = item(
            """{"id":"B","name":"scan.jpg","file":{"mimeType":"image/jpeg"},
               "photo":{"takenDateTime":"2020-03-01T00:00:00Z"}}"""
        )
        val row = PhotoParser.toPhotoRow("/drive/root:/Foto's/1998/06/Vakantie", json)
        assertEquals(1998, row!!.year)
    }

    @Test
    fun `jaar valt terug op EXIF als de map geen jaar heeft`() {
        val json = item(
            """{"id":"C","name":"x.jpg","file":{"mimeType":"image/jpeg"},
               "photo":{"takenDateTime":"2014-09-09T00:00:00Z"}}"""
        )
        val row = PhotoParser.toPhotoRow("/drive/root:/Diversen/Onbekend", json)
        assertEquals(2014, row!!.year)
    }

    @Test
    fun `mappen en niet-afbeeldingen leveren null`() {
        val folder = item("""{"id":"D","name":"2019","folder":{"childCount":3}}""")
        val doc = item("""{"id":"E","name":"brief.docx","file":{"mimeType":"application/msword"}}""")
        assertNull(PhotoParser.toPhotoRow("/drive/root:/Foto's", folder))
        assertNull(PhotoParser.toPhotoRow("/drive/root:/Foto's", doc))
    }

    @Test
    fun `HTML-entiteiten in de beschrijving worden gedecodeerd`() {
        val json = item(
            """{"id":"H","name":"x.jpg","file":{"mimeType":"image/jpeg"},
               "description":"Anne &amp; Tom zeiden &quot;ja&quot; &#39;t was mooi &#x263A;"}"""
        )
        val row = PhotoParser.toPhotoRow("/x", json)
        assertEquals("Anne & Tom zeiden \"ja\" 't was mooi ☺", row!!.description)
    }

    @Test
    fun `lege of ontbrekende beschrijving wordt null, niet leeg`() {
        val blank = item("""{"id":"F","name":"a.jpg","description":"  ","file":{"mimeType":"image/jpeg"}}""")
        val missing = item("""{"id":"G","name":"b.jpg","file":{"mimeType":"image/jpeg"}}""")
        assertNull(PhotoParser.toPhotoRow("/x", blank)!!.description)
        assertNull(PhotoParser.toPhotoRow("/x", missing)!!.description)
    }
}
