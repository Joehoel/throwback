package fyi.kuijper.throwback.onedrive

import androidx.exifinterface.media.ExifInterface
import org.apache.commons.text.StringEscapeUtils
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/**
 * Reads the caption from *embedded* photo metadata (EXIF/XMP). Needed since OneDrive's new storage
 * backend (item ids with `!s…`) stops returning the caption as `driveItem.description` even though it
 * is in the file — Windows writes it (Details tab: Title/Subject/Comments) to `ImageDescription` and
 * XMP `dc:description`/`dc:title`.
 *
 * The caption sits near the front of the JPEG (within the first ~16 KB), so the caller only needs a
 * small slice of the file. The Android [ExifInterface] read lives here; the text extraction below it
 * ([cleanCaption]/[captionFromXmp]) is pure and Android-free, so it stays unit-testable on its own.
 */
object ExifCaption {

    fun parse(bytes: ByteArray): String? = parse(ByteArrayInputStream(bytes))

    fun parse(input: InputStream): String? {
        val exif = runCatching { ExifInterface(input) }.getOrNull() ?: return null
        // Read the *raw bytes*, not getAttribute's String: ExifInterface decodes string tags byte-by-byte
        // and replaces every non-ASCII byte with '?', wrecking any UTF-8 caption. Preference order: the
        // ImageDescription field (where Windows also writes Title/Subject), then XMP dc:description/dc:title.
        captionFromExifBytes(exif.getAttributeBytes(ExifInterface.TAG_IMAGE_DESCRIPTION))?.let { return it }
        return captionFromXmp(exif.getAttributeBytes(ExifInterface.TAG_XMP)?.let(::decodeUtf8OrLatin1))
    }
}

/**
 * Decode a raw EXIF string-attribute (e.g. ImageDescription), then clean it. We take the *bytes*
 * (getAttributeBytes), not getAttribute's String, because ExifInterface decodes IFD_FORMAT_STRING
 * byte-by-byte and turns every non-ASCII byte into a literal '?' — destroying any UTF-8 caption
 * (Windows writes the Details-tab text here as UTF-8). Decode UTF-8 ourselves.
 */
internal fun captionFromExifBytes(bytes: ByteArray?): String? =
    bytes?.let { cleanCaption(decodeUtf8OrLatin1(it)) }

/** UTF-8 if the bytes are valid UTF-8 (the common case Windows writes), else Latin-1 so nothing is lost. */
private fun decodeUtf8OrLatin1(bytes: ByteArray): String = runCatching {
    Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString()
}.getOrElse { String(bytes, Charsets.ISO_8859_1) }

/** Strip control/NUL chars (incl. the UTF-16 null terminator), normalize whitespace; null if empty. */
internal fun cleanCaption(value: String?): String? = value
    ?.let(::repairLatin1Utf8)
    ?.replace(Regex("\\p{Cntrl}"), " ")
    ?.replace(Regex("\\s+"), " ")
    ?.trim()
    ?.ifBlank { null }

/**
 * Secondary net: undo "UTF-8 bytes decoded as Latin-1" mojibake (a trema "Joël" arriving as "JoÃ«l").
 * The EXIF path already decodes its raw bytes correctly ([decodeUtf8OrLatin1]); this only catches a
 * caption that reaches us *already* stringified that way from elsewhere. We re-interpret the chars as
 * their raw bytes and decode strictly as UTF-8; only a string that *is* exactly such a misread succeeds,
 * so correct text (incl. an already-right "Joël", whose bytes aren't valid UTF-8) and real Unicode pass through.
 */
private fun repairLatin1Utf8(s: String): String {
    if (s.none { it.code in 0xC2..0xF4 }) return s // no UTF-8 lead-byte → nothing to repair
    if (s.any { it.code > 0xFF }) return s          // real Unicode present → not a Latin-1 misread
    return runCatching {
        val bytes = ByteArray(s.length) { s[it].code.toByte() }
        Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    }.getOrDefault(s)
}

internal fun captionFromXmp(xmp: String?): String? {
    if (xmp.isNullOrBlank()) return null
    for (tag in arrayOf("dc:description", "dc:title")) {
        val block = Regex("<$tag[^>]*>(.*?)</$tag>", setOf(RegexOption.DOT_MATCHES_ALL))
            .find(xmp)?.groupValues?.get(1) ?: continue
        // Value is often wrapped in rdf:Alt/rdf:li; strip all tags, decode XML entities (&amp;, &#235;,
        // …, like the typed-description path does), then normalize.
        val text = StringEscapeUtils.unescapeHtml4(block.replace(Regex("<[^>]+>"), " "))
        cleanCaption(text)?.let { return it }
    }
    return null
}
