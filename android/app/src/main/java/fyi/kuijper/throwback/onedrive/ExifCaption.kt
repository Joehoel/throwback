package fyi.kuijper.throwback.onedrive

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.Metadata
import com.drew.metadata.exif.ExifIFD0Directory
import com.drew.metadata.xmp.XmpDirectory
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/**
 * Reads the caption from *embedded* photo metadata (EXIF/XMP). Needed since OneDrive's new storage
 * backend (item ids with `!s…`) stops returning the caption as `driveItem.description` even though it
 * is in the file — Windows writes it (Verkenner Details tab: Titel/Onderwerp/Opmerkingen) to the XMP
 * `dc:description`/`dc:title`, the Windows `XP*` tags (UTF-16), and EXIF `ImageDescription`.
 *
 * Parsing is delegated to **metadata-extractor** (Drew Noakes): it reads every format the mixed library
 * holds (JPEG/PNG/HEIC/TIFF), decodes the Windows `XP*` tags as UTF-16LE, and parses XMP via xmpcore —
 * all the byte-level work we used to hand-roll. Crucially it is pure-JVM, so this whole path now unit-
 * tests without an instrumented device (unlike `androidx.exifinterface`, which it replaced).
 *
 * The caller passes a slice from the front of the file ([DescriptionResolver] sizes it via
 * [JpegSegments]); that slice must cover the EXIF + XMP `APP1` segments. We keep only the source
 * *order* ([pickCaption]) and text *clean-up* ([cleanCaption]) here, both pure and Android-free.
 */
object ExifCaption {

    fun parse(bytes: ByteArray): String? = parse(ByteArrayInputStream(bytes))

    fun parse(input: InputStream): String? {
        val metadata = runCatching { ImageMetadataReader.readMetadata(input) }.getOrNull() ?: return null
        val exif = metadata.getFirstDirectoryOfType(ExifIFD0Directory::class.java)
        return pickCaption(
            xmp = xmpCaption(metadata),
            // getDescription decodes the Windows XP* tags as UTF-16LE (accent-safe) and strips the NUL.
            xpTitle = exif?.getDescription(ExifIFD0Directory.TAG_WIN_TITLE),
            xpSubject = exif?.getDescription(ExifIFD0Directory.TAG_WIN_SUBJECT),
            xpComment = exif?.getDescription(ExifIFD0Directory.TAG_WIN_COMMENT),
            imageDescription = exif?.getDescription(ExifIFD0Directory.TAG_IMAGE_DESCRIPTION),
        )
    }

    /** XMP `dc:description`, else `dc:title`. Lang-alt values serialize as `dc:description[1]`. */
    private fun xmpCaption(metadata: Metadata): String? {
        val props = metadata.getFirstDirectoryOfType(XmpDirectory::class.java)?.xmpProperties ?: return null
        fun first(key: String) = props[key] ?: props["$key[1]"]
        return first("dc:description") ?: first("dc:title")
    }
}

/**
 * Choose the caption from the places Windows writes it, in the order ADR-0019 mandates: the clean,
 * cross-format XMP first, then the accent-safe UTF-16 Windows XP tags (Titel/Onderwerp/Opmerkingen),
 * and only as a last resort the EXIF `ImageDescription` — which is mojibake for Dutch accents.
 *
 * This is why Windows-authored captions went missing on the TV before: the old reader looked only at
 * `ImageDescription` + XMP (and `androidx.exifinterface` cannot read the XP tags at all), so a caption
 * typed into the Verkenner XP fields was invisible, and a photo that had both showed the mojibake EXIF
 * value instead of the clean one. Each candidate is cleaned; the first non-blank wins.
 */
internal fun pickCaption(
    xmp: String?,
    xpTitle: String?,
    xpSubject: String?,
    xpComment: String?,
    imageDescription: String?,
): String? =
    cleanCaption(xmp)
        ?: cleanCaption(xpTitle)
        ?: cleanCaption(xpSubject)
        ?: cleanCaption(xpComment)
        ?: cleanCaption(imageDescription)

/** Strip control/NUL chars (incl. the UTF-16 null terminator), normalize whitespace; null if empty. */
internal fun cleanCaption(value: String?): String? = value
    ?.let(::repairLatin1Utf8)
    ?.replace(Regex("\\p{Cntrl}"), " ")
    ?.replace(Regex("\\s+"), " ")
    ?.trim()
    ?.ifBlank { null }

/**
 * Secondary net: undo "UTF-8 bytes decoded as Latin-1" mojibake (a trema "Joël" arriving as "JoÃ«l").
 * metadata-extractor decodes XMP (UTF-8) and the XP tags (UTF-16) correctly; this only catches the
 * last-resort EXIF `ImageDescription`, which it may hand back already stringified that way. We re-
 * interpret the chars as their raw bytes and decode strictly as UTF-8; only a string that *is* exactly
 * such a misread succeeds, so correct text (incl. an already-right "Joël", whose bytes aren't valid
 * UTF-8) and real Unicode pass through.
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
