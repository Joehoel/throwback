package fyi.kuijper.throwback.onedrive

/**
 * Resolves a photo's Beschrijving via the fixed fallback chain (ADR-0004): first the typed
 * `driveItem.description` field; if empty, the *embedded* photo metadata (EXIF `ImageDescription` ->
 * XMP `dc:description`/`dc:title`, via [ExifCaption]).
 *
 * The byte source ([fetchBytes], typically a Range-GET of the first ~32 KB) and the parser
 * ([parseEmbedded]) are injectable, so the chain is unit-testable apart from Graph and Android's
 * ExifInterface.
 */
class DescriptionResolver(
    private val fetchBytes: suspend (photoId: String) -> ByteArray?,
    private val parseEmbedded: (ByteArray) -> String? = ExifCaption::parse,
) {
    /** [typed] if present, else the embedded fallback, else [typed] (empty/null). */
    suspend fun resolve(typed: String?, photoId: String): String? {
        if (!typed.isNullOrBlank()) return typed
        val bytes = runCatching { fetchBytes(photoId) }.getOrNull() ?: return typed
        return parseEmbedded(bytes) ?: typed
    }
}
