package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
        val resolver = DescriptionResolver({ _, _ -> fetched = true; null }, asText)
        assertEquals("Bruiloft Anne & Tom", resolver.resolve("Bruiloft Anne & Tom", "p1"))
        assertFalse("geen content-GET nodig als het veld al gevuld is", fetched)
    }

    @Test
    fun `een leeg veld valt terug op de ingebedde metadata`() = runBlocking {
        val resolver = DescriptionResolver({ _, _ -> "Ingebed bijschrift".toByteArray() }, asText)
        assertEquals("Ingebed bijschrift", resolver.resolve(null, "p1"))
        assertEquals("Ingebed bijschrift", resolver.resolve("   ", "p1")) // blank counts as empty
    }

    @Test
    fun `geen veld en geen ingebedde tekst geeft null`() = runBlocking {
        val resolver = DescriptionResolver({ _, _ -> ByteArray(0) }, asText) // parser -> null on empty bytes
        assertNull(resolver.resolve(null, "p1"))
    }

    @Test
    fun `een mislukte download laat de oorspronkelijke (lege) waarde staan`() = runBlocking {
        val resolver = DescriptionResolver({ _, _ -> error("netwerkfout") }, asText)
        assertNull(resolver.resolve(null, "p1"))
    }

    /**
     * A toy JPEG: SOI + one EXIF `APP1` declaring [declaredLen] bytes, then a SOS marker. The caption
     * only "parses" once the whole header region is present, mimicking ExifInterface's read-to-scan.
     */
    private fun jpegWithApp1(declaredLen: Int): ByteArray {
        val app1End = 2 + 2 + declaredLen           // SOI(2) + marker(2) + declaredLen
        val total = app1End + 2                      // + SOS marker
        return ByteArray(total).also {
            it[0] = 0xFF.toByte(); it[1] = 0xD8.toByte()                 // SOI
            it[2] = 0xFF.toByte(); it[3] = 0xE1.toByte()                 // APP1 marker
            it[4] = (declaredLen ushr 8).toByte(); it[5] = (declaredLen and 0xFF).toByte()
            it[app1End] = 0xFF.toByte(); it[app1End + 1] = 0xDA.toByte() // SOS (start of scan)
        }
    }

    /** Records each requested window and serves the first N bytes of [full]. */
    private class SlicingSource(private val full: ByteArray) {
        val windows = mutableListOf<Int>()
        val fetch: suspend (String, Int) -> ByteArray? = { _, n ->
            windows += n
            full.copyOf(minOf(n, full.size))
        }
    }

    @Test
    fun `te kleine eerste slice wordt verbreed tot de scan bereikt is`() = runBlocking {
        // APP1 declares 200 bytes → header region (incl. SOS) ends at 206, far past the 8-byte first read.
        val full = jpegWithApp1(declaredLen = 200)
        val src = SlicingSource(full)
        val parsed = { b: ByteArray -> if (b.size >= full.size) "Vakantie" else null } // read-to-scan
        val resolver = DescriptionResolver(src.fetch, parsed, initialBytes = 8, maxBytes = 1 shl 20)

        assertEquals("Vakantie", resolver.resolve(null, "p1"))
        assertEquals("verbreedt precies één keer", 2, src.windows.size)
        assertEquals(8, src.windows.first())
        assertTrue("tweede read is groter dan de eerste", src.windows[1] > 8)
    }

    @Test
    fun `een passende eerste slice wordt niet opnieuw opgehaald`() = runBlocking {
        val full = jpegWithApp1(declaredLen = 40)
        val src = SlicingSource(full)
        val parsed = { b: ByteArray -> if (b.size >= full.size) "Bruiloft" else null }
        val resolver = DescriptionResolver(src.fetch, parsed, initialBytes = 256, maxBytes = 1 shl 20)

        assertEquals("Bruiloft", resolver.resolve(null, "p1"))
        assertEquals("één request als de scan al binnen is", listOf(256), src.windows)
    }

    @Test
    fun `verbreden stopt bij de bovengrens (geen eindeloze GETs)`() = runBlocking {
        // Header region needs ~5006 bytes, but initialBytes already hits maxBytes → no widen, parse fails.
        val src = SlicingSource(jpegWithApp1(declaredLen = 5000))
        val parsed = { b: ByteArray -> if (b.size >= 5006) "x" else null }
        val resolver = DescriptionResolver(src.fetch, parsed, initialBytes = 64, maxBytes = 64)

        assertNull(resolver.resolve(null, "p1"))
        assertEquals("geen tweede GET voorbij de bovengrens", listOf(64), src.windows)
    }
}
