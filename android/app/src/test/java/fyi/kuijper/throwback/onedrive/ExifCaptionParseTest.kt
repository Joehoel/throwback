package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * End-to-end [ExifCaption.parse] over hand-built JPEGs. metadata-extractor is pure-JVM, so this runs
 * as a plain unit test — no instrumented device. Each JPEG carries real EXIF (Windows XP* tags and/or
 * ImageDescription) and/or an XMP packet, mirroring how a Windows-authored photo stores its caption.
 */
class ExifCaptionParseTest {

    private data class Tag(val id: Int, val type: Int, val value: ByteArray)

    private object TagId { const val IMAGE_DESCRIPTION = 0x010E; const val XP_TITLE = 0x9C9B; const val XP_COMMENT = 0x9C9C; const val XP_SUBJECT = 0x9C9F }

    /** A Windows XP* tag: UTF-16LE text + the two-byte NUL terminator Windows appends (TIFF type BYTE). */
    private fun xp(id: Int, text: String) = Tag(id, 1, text.toByteArray(Charsets.UTF_16LE) + byteArrayOf(0, 0))

    /** An ASCII/UTF-8 EXIF string tag (e.g. ImageDescription), NUL-terminated (TIFF type ASCII). */
    private fun ascii(id: Int, text: String) = Tag(id, 2, text.toByteArray(Charsets.UTF_8) + byteArrayOf(0))

    /** Build a real little-endian JPEG: SOI + EXIF APP1 + optional XMP APP1 + SOS. */
    private fun jpeg(exif: List<Tag> = emptyList(), xmp: String? = null): ByteArray {
        fun u16le(v: Int) = byteArrayOf(v.toByte(), (v ushr 8).toByte())
        fun u32le(v: Int) = byteArrayOf(v.toByte(), (v ushr 8).toByte(), (v ushr 16).toByte(), (v ushr 24).toByte())
        fun u16be(v: Int) = byteArrayOf((v ushr 8).toByte(), v.toByte())

        val out = ArrayList<Byte>()
        out += listOf(0xFF.toByte(), 0xD8.toByte()) // SOI

        if (exif.isNotEmpty()) {
            val dataStart = 8 + 2 + exif.size * 12 + 4 // after TIFF header + IFD entries + next-IFD offset
            val ext = ArrayList<Byte>()
            val entries = ArrayList<Byte>()
            entries += u16le(exif.size).toList()
            for (t in exif) {
                entries += u16le(t.id).toList()
                entries += u16le(t.type).toList()
                entries += u32le(t.value.size).toList()
                if (t.value.size <= 4) entries += t.value.toList() + List(4 - t.value.size) { 0.toByte() }
                else { entries += u32le(dataStart + ext.size).toList(); ext += t.value.toList() }
            }
            entries += u32le(0).toList() // next-IFD offset
            val tiff = ArrayList<Byte>()
            tiff += listOf(0x49.toByte(), 0x49.toByte()) // "II" little-endian
            tiff += u16le(42).toList()                   // TIFF magic
            tiff += u32le(8).toList()                    // IFD0 offset
            tiff += entries; tiff += ext
            val sig = byteArrayOf(0x45, 0x78, 0x69, 0x66, 0x00, 0x00) // "Exif\0\0"
            out += listOf(0xFF.toByte(), 0xE1.toByte())
            out += u16be(2 + sig.size + tiff.size).toList()
            out += sig.toList(); out += tiff
        }

        if (xmp != null) {
            val header = "http://ns.adobe.com/xap/1.0/\u0000".toByteArray(Charsets.US_ASCII)
            val body = xmp.toByteArray(Charsets.UTF_8)
            out += listOf(0xFF.toByte(), 0xE1.toByte())
            out += u16be(2 + header.size + body.size).toList()
            out += header.toList(); out += body.toList()
        }

        out += listOf(0xFF.toByte(), 0xDA.toByte()) // SOS
        return out.toByteArray()
    }

    private fun xmpPacket(tag: String, text: String) = """
        <x:xmpmeta xmlns:x="adobe:ns:meta/">
          <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
            <rdf:Description rdf:about="">
              <$tag><rdf:Alt><rdf:li xml:lang="x-default">$text</rdf:li></rdf:Alt></$tag>
            </rdf:Description>
          </rdf:RDF>
        </x:xmpmeta>
    """.trimIndent()

    // The user's bug: caption lives ONLY in the Windows XPTitle (UTF-16). The old reader (and
    // androidx.exifinterface) never looked there, so it was missing on the TV. And the trema survives.
    @Test fun `recovers an XPTitle-only caption with accents`() {
        assertEquals("Joël op vaderdag", ExifCaption.parse(jpeg(exif = listOf(xp(TagId.XP_TITLE, "Joël op vaderdag")))))
    }

    @Test fun `recovers an XPSubject when there is no title`() {
        assertEquals("Onderwerp", ExifCaption.parse(jpeg(exif = listOf(xp(TagId.XP_SUBJECT, "Onderwerp")))))
    }

    // Clean XMP must win over the mojibake-prone EXIF ImageDescription per ADR-0019's read order.
    @Test fun `XMP description wins over EXIF ImageDescription`() {
        val bytes = jpeg(
            exif = listOf(ascii(TagId.IMAGE_DESCRIPTION, "iets ouds")),
            xmp = xmpPacket("dc:description", "Wokken op vaderdag"),
        )
        assertEquals("Wokken op vaderdag", ExifCaption.parse(bytes))
    }

    @Test fun `falls back to dc-title when there is no description`() {
        assertEquals("Zomer in de tuin", ExifCaption.parse(jpeg(xmp = xmpPacket("dc:title", "Zomer in de tuin"))))
    }

    // Last resort: only EXIF ImageDescription is present.
    @Test fun `reads EXIF ImageDescription as the last resort`() {
        assertEquals("Vakantie", ExifCaption.parse(jpeg(exif = listOf(ascii(TagId.IMAGE_DESCRIPTION, "Vakantie")))))
    }

    @Test fun `a photo with no caption metadata yields null`() {
        assertNull(ExifCaption.parse(jpeg()))
        assertNull(ExifCaption.parse(ByteArray(0)))
    }
}
