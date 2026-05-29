package fyi.kuijper.throwback.onedrive

import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.InputStream

/**
 * Leest het bijschrift uit de *ingebedde* fotometadata (EXIF/XMP). Nodig sinds OneDrive's nieuwe
 * opslag-backend (item-id's met `!s…`) het bijschrift niet meer als `driveItem.description`
 * teruggeeft, terwijl het wél in het bestand staat — Windows schrijft het via het tabblad
 * "Details" (Titel/Onderwerp/Opmerkingen) naar `ImageDescription`, de `XP*`-tags én XMP.
 *
 * Het bijschrift zit vooraan in de JPEG (binnen de eerste ~16 KB), dus de aanroeper hoeft maar een
 * klein stukje van het bestand te downloaden. De tekst-parsing zit in [EmbeddedCaptionText] (puur,
 * los testbaar); hier alleen de Android [ExifInterface]-laag.
 */
object ExifCaption {

    fun parse(bytes: ByteArray): String? = parse(ByteArrayInputStream(bytes))

    fun parse(input: InputStream): String? {
        val exif = runCatching { ExifInterface(input) }.getOrNull() ?: return null
        // Voorkeursvolgorde: het schone ASCII-veld (waar Windows ook Titel/Onderwerp naartoe schrijft),
        // dan XMP dc:description/dc:title. (androidx ExifInterface kent geen XP_*-constanten.)
        EmbeddedCaptionText.clean(exif.getAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION))?.let { return it }
        return EmbeddedCaptionText.captionFromXmp(exif.getAttribute(ExifInterface.TAG_XMP))
    }
}
