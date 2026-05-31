package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The pure (Android-free) text extraction beneath [ExifCaption]. The Android [androidx.exifinterface]
 * read itself ([ExifCaption.parse]) needs an instrumented test; the text munging is covered here.
 */
class ExifCaptionTextTest {

    @Test fun `pulls dc-description from an XMP packet`() {
        val xmp = """
            <x:xmpmeta xmlns:x="adobe:ns:meta/">
              <rdf:RDF><rdf:Description>
                <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Wokken op vaderdag</rdf:li></rdf:Alt></dc:description>
              </rdf:Description></rdf:RDF>
            </x:xmpmeta>
        """.trimIndent()
        assertEquals("Wokken op vaderdag", captionFromXmp(xmp))
    }

    @Test fun `falls back to dc-title when no description`() {
        val xmp = "<dc:title><rdf:Alt><rdf:li>Zomer in de tuin</rdf:li></rdf:Alt></dc:title>"
        assertEquals("Zomer in de tuin", captionFromXmp(xmp))
    }

    @Test fun `blank or missing XMP yields null`() {
        assertNull(captionFromXmp(null))
        assertNull(captionFromXmp(""))
    }

    @Test fun `clean normalizes whitespace and empties`() {
        assertEquals("a b", cleanCaption("  a   b\n"))
        assertNull(cleanCaption("   "))
    }
}
