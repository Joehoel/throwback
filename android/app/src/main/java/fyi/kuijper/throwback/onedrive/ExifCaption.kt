package fyi.kuijper.throwback.onedrive

import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.InputStream

/**
 * Reads the caption from *embedded* photo metadata (EXIF/XMP). Needed since OneDrive's new storage
 * backend (item ids with `!s…`) stops returning the caption as `driveItem.description` even though it
 * is in the file — Windows writes it (Details tab: Title/Subject/Comments) to `ImageDescription`, the
 * `XP*` tags and XMP.
 *
 * The caption sits near the front of the JPEG (within the first ~16 KB), so the caller only needs a
 * small slice of the file. Text parsing lives in [EmbeddedCaptionText]; this is just the Android
 * [ExifInterface] layer.
 */
object ExifCaption {

    fun parse(bytes: ByteArray): String? = parse(ByteArrayInputStream(bytes))

    fun parse(input: InputStream): String? {
        val exif = runCatching { ExifInterface(input) }.getOrNull() ?: return null
        // Preference order: the clean ASCII field (where Windows also writes Title/Subject), then XMP
        // dc:description/dc:title. (androidx ExifInterface has no XP_* constants.)
        EmbeddedCaptionText.clean(exif.getAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION))?.let { return it }
        return EmbeddedCaptionText.captionFromXmp(exif.getAttribute(ExifInterface.TAG_XMP))
    }
}
