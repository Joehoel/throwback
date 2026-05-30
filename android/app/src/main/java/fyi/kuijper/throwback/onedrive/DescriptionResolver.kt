package fyi.kuijper.throwback.onedrive

/**
 * Bepaalt de **Beschrijving** van een foto volgens de vastgelegde terugval-keten (ADR-0004):
 * eerst het getypte `driveItem.description`-veld; is dat leeg, dan de *ingebedde* fotometadata
 * (EXIF `ImageDescription` → XMP `dc:description`/`dc:title`, via [ExifCaption]).
 *
 * De byte-bron ([fetchBytes], doorgaans een Range-GET van de eerste ~32 KB) en de parser
 * ([parseEmbedded]) zijn injecteerbaar, zodat de keten los van Graph én los van Android's
 * ExifInterface unit-testbaar is. De aanroeper ([GraphSync]) regelt alleen nog parallellie/opslag.
 */
class DescriptionResolver(
    private val fetchBytes: suspend (photoId: String) -> ByteArray?,
    private val parseEmbedded: (ByteArray) -> String? = ExifCaption::parse,
) {
    /** De Beschrijving: [typed] indien aanwezig, anders de ingebedde terugval, anders [typed] (leeg/null). */
    suspend fun resolve(typed: String?, photoId: String): String? {
        if (!typed.isNullOrBlank()) return typed
        val bytes = runCatching { fetchBytes(photoId) }.getOrNull() ?: return typed
        return parseEmbedded(bytes) ?: typed
    }
}
