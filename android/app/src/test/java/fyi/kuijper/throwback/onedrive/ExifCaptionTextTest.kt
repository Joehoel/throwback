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

    // XMP is XML, so a trema can be a numeric char-ref and an ampersand is always &amp;. Decode entities.
    @Test fun `decodes XML entities in XMP (trema and ampersand)`() {
        assertEquals("Joël", captionFromXmp("<dc:description><rdf:Alt><rdf:li>Jo&#235;l</rdf:li></rdf:Alt></dc:description>"))
        assertEquals("Anne & Tom", captionFromXmp("<dc:description><rdf:Alt><rdf:li>Anne &amp; Tom</rdf:li></rdf:Alt></dc:description>"))
    }

    @Test fun `clean normalizes whitespace and empties`() {
        assertEquals("a b", cleanCaption("  a   b\n"))
        assertNull(cleanCaption("   "))
    }

    // ExifInterface hands back the embedded caption's UTF-8 bytes decoded as Latin-1, so a trema
    // (Joël, Israël, Loïs) arrives as mojibake (JoÃ«l). Repair it back to the real characters.
    @Test fun `clean repairs UTF-8 read as Latin-1 (trema mojibake)`() {
        fun mojibake(s: String) = String(s.toByteArray(Charsets.UTF_8), Charsets.ISO_8859_1)
        assertEquals("Joël", cleanCaption(mojibake("Joël")))
        assertEquals("Israël", cleanCaption(mojibake("Israël")))
        assertEquals("Loïs", cleanCaption(mojibake("Loïs")))
    }

    @Test fun `clean leaves correct text untouched`() {
        assertEquals("Joël", cleanCaption("Joël"))       // already-correct trema must survive
        assertEquals("Wokken op vaderdag", cleanCaption("Wokken op vaderdag"))
        assertEquals("Anne & Tom", cleanCaption("Anne & Tom"))
    }
}
