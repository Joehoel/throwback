package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Tests the Beschrijving fallback chain apart from Graph and Android: byte source and parser are
 * injectable. The parser stub here just reads bytes as UTF-8 (real EXIF/XMP parsing is in [ExifCaption]).
 */
class DescriptionResolverTest {

    private val asText: (ByteArray) -> String? = { String(it).ifBlank { null } }

    @Test
    fun `het getypte veld wint en er wordt niet gedownload`() = runBlocking {
        var fetched = false
        val resolver = DescriptionResolver({ fetched = true; null }, asText)
        assertEquals("Bruiloft Anne & Tom", resolver.resolve("Bruiloft Anne & Tom", "p1"))
        assertFalse("geen content-GET nodig als het veld al gevuld is", fetched)
    }

    @Test
    fun `een leeg veld valt terug op de ingebedde metadata`() = runBlocking {
        val resolver = DescriptionResolver({ "Ingebed bijschrift".toByteArray() }, asText)
        assertEquals("Ingebed bijschrift", resolver.resolve(null, "p1"))
        assertEquals("Ingebed bijschrift", resolver.resolve("   ", "p1")) // blank counts as empty
    }

    @Test
    fun `geen veld en geen ingebedde tekst geeft null`() = runBlocking {
        val resolver = DescriptionResolver({ ByteArray(0) }, asText) // parser -> null on empty bytes
        assertNull(resolver.resolve(null, "p1"))
    }

    @Test
    fun `een mislukte download laat de oorspronkelijke (lege) waarde staan`() = runBlocking {
        val resolver = DescriptionResolver({ error("netwerkfout") }, asText)
        assertNull(resolver.resolve(null, "p1"))
    }
}
