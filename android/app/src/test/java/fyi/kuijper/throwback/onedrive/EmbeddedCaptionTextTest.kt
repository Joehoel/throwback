package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EmbeddedCaptionTextTest {

    @Test fun `decodes Windows XP tag bytes (UTF-16LE, comma-separated, null-terminated)`() {
        // "Hoi" = H,o,i in UTF-16LE plus trailing null terminator, as ExifInterface reports it.
        val raw = "72, 0, 111, 0, 105, 0, 0, 0"
        assertEquals("Hoi", EmbeddedCaptionText.decodeXpString(raw))
    }

    @Test fun `blank XP tag yields null`() {
        assertNull(EmbeddedCaptionText.decodeXpString(null))
        assertNull(EmbeddedCaptionText.decodeXpString(""))
    }

    @Test fun `pulls dc-description from an XMP packet`() {
        val xmp = """
            <x:xmpmeta xmlns:x="adobe:ns:meta/">
              <rdf:RDF><rdf:Description>
                <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Wokken op vaderdag</rdf:li></rdf:Alt></dc:description>
              </rdf:Description></rdf:RDF>
            </x:xmpmeta>
        """.trimIndent()
        assertEquals("Wokken op vaderdag", EmbeddedCaptionText.captionFromXmp(xmp))
    }

    @Test fun `falls back to dc-title when no description`() {
        val xmp = "<dc:title><rdf:Alt><rdf:li>Zomer in de tuin</rdf:li></rdf:Alt></dc:title>"
        assertEquals("Zomer in de tuin", EmbeddedCaptionText.captionFromXmp(xmp))
    }

    @Test fun `clean normalizes whitespace and empties`() {
        assertEquals("a b", EmbeddedCaptionText.clean("  a   b\n"))
        assertNull(EmbeddedCaptionText.clean("   "))
    }
}
