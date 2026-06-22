package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The pure (Android-free) pieces beneath [ExifCaption]: the source-priority [pickCaption] and the
 * text clean-up [cleanCaption]. The full EXIF/XMP parse is covered end-to-end in [ExifCaptionParseTest]
 * (metadata-extractor is pure-JVM, so that no longer needs an instrumented device).
 */
class ExifCaptionTextTest {

    @Test fun `clean normalizes whitespace and empties`() {
        assertEquals("a b", cleanCaption("  a   b\n"))
        assertNull(cleanCaption("   "))
        assertNull(cleanCaption(null))
    }

    // Secondary net for a caption that arrives already mojibake'd (UTF-8 bytes read as Latin-1):
    // a trema (Joël, Israël, Loïs) shows as JoÃ«l. Repair it back to the real characters.
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

    // The read order ADR-0019 mandates: clean XMP/XP win, the mojibake EXIF ImageDescription is the
    // last resort. A Windows photo carries the caption in several places at once, so when XMP is
    // present its clean value must win over a mojibake EXIF one.
    @Test fun `XMP wins over the EXIF ImageDescription`() {
        assertEquals("Joël", pickCaption("Joël", "Joël", null, null, "JoÃ«l"))
    }

    // The bug the user hit: the caption lives ONLY in a Windows XP tag (no XMP, no ImageDescription).
    // The old reader looked only at ImageDescription + XMP, so these came back empty on the TV.
    @Test fun `recovers a caption that lives only in an XP tag`() {
        assertEquals("Wokken op vaderdag", pickCaption(null, "Wokken op vaderdag", null, null, null))
    }

    @Test fun `falls back XPTitle then XPSubject then XPComment`() {
        assertEquals("Onderwerp", pickCaption(null, null, "Onderwerp", "Opmerking", null))
        assertEquals("Opmerking", pickCaption(null, null, null, "Opmerking", null))
    }

    // Nothing clean anywhere → fall through to EXIF ImageDescription rather than returning null.
    @Test fun `uses EXIF ImageDescription only as the last resort`() {
        assertEquals("Vakantie", pickCaption(null, null, null, null, "Vakantie"))
        assertNull(pickCaption(null, null, null, null, null))
        assertNull(pickCaption("  ", "", null, "\t", null)) // all blank/control → null
    }
}
