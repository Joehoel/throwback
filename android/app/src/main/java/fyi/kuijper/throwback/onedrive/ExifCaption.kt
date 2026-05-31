package fyi.kuijper.throwback.onedrive

import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.InputStream

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
        // Preference order: the clean ASCII field (where Windows also writes Title/Subject), then XMP
        // dc:description/dc:title. (androidx ExifInterface has no XP_* constants.)
        cleanCaption(exif.getAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION))?.let { return it }
        return captionFromXmp(exif.getAttribute(ExifInterface.TAG_XMP))
    }
}

/** Strip control/NUL chars (incl. the UTF-16 null terminator), normalize whitespace; null if empty. */
internal fun cleanCaption(value: String?): String? = value
    ?.replace(Regex("\\p{Cntrl}"), " ")
    ?.replace(Regex("\\s+"), " ")
    ?.trim()
    ?.ifBlank { null }

internal fun captionFromXmp(xmp: String?): String? {
    if (xmp.isNullOrBlank()) return null
    for (tag in arrayOf("dc:description", "dc:title")) {
        val block = Regex("<$tag[^>]*>(.*?)</$tag>", setOf(RegexOption.DOT_MATCHES_ALL))
            .find(xmp)?.groupValues?.get(1) ?: continue
        // Value is often wrapped in rdf:Alt/rdf:li; strip all tags and normalize.
        cleanCaption(block.replace(Regex("<[^>]+>"), " "))?.let { return it }
    }
    return null
}
