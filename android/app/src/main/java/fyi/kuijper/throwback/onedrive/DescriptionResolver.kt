package fyi.kuijper.throwback.onedrive

/**
 * Resolves a photo's Beschrijving via the fixed fallback chain (ADR-0004): first the typed
 * `driveItem.description` field; if empty, the *embedded* photo metadata (EXIF `ImageDescription` ->
 * XMP `dc:description`/`dc:title`, via [ExifCaption]).
 *
 * The embedded metadata is read from the *front* of the file over a Range-GET, never the whole photo.
 * The tricky part is sizing that read: `ExifInterface` walks every header segment and aborts if the
 * slice cuts one off, only stopping at the start-of-scan — and camera JPEGs push the EXIF `APP1`
 * (thumbnail inside) up to its ~64 KB limit with XMP + ICC after it. So we fetch [initialBytes]
 * (enough to reach the scan in one request for an ordinary photo), then — only if [JpegSegments]
 * reports the headers run past what we fetched (large metadata, Extended XMP, big ICC) — widen to
 * cover them, bounded by [maxBytes] so a pathological file can't run away.
 *
 * The byte source ([fetchBytes], a Range-GET of the first N bytes) and the parser ([parseEmbedded])
 * are injectable, so the whole chain is unit-testable apart from Graph and Android's ExifInterface.
 */
class DescriptionResolver(
    private val fetchBytes: suspend (photoId: String, byteCount: Int) -> ByteArray?,
    private val parseEmbedded: (ByteArray) -> String? = ExifCaption::parse,
    private val initialBytes: Int = INITIAL_BYTES,
    private val maxBytes: Int = MAX_BYTES,
) {
    /** [typed] if present, else the embedded fallback, else [typed] (empty/null). */
    suspend fun resolve(typed: String?, photoId: String): String? {
        if (!typed.isNullOrBlank()) return typed
        var bytes = fetch(photoId, initialBytes) ?: return typed
        // Widen until the slice reaches the start-of-scan, i.e. holds every header segment ExifInterface
        // will touch. [JpegSegments.headerEnd] returns ≤ size once complete, or a larger "need this much"
        // value otherwise. Each widen grows geometrically (and at least one SLACK_BYTES past the segment
        // we stopped on), so even headers that run to several hundred KB — Extended XMP, a big ICC — are
        // reached within a few rounds. Bounded by maxBytes and a round cap, so it terminates on any input.
        var rounds = 0
        while (rounds++ < MAX_WIDENINGS) {
            val needed = JpegSegments.headerEnd(bytes) ?: break
            if (needed <= bytes.size || bytes.size >= maxBytes) break
            bytes = fetch(photoId, minOf(maxOf(needed + SLACK_BYTES, bytes.size * 2), maxBytes)) ?: break
        }
        return parseEmbedded(bytes) ?: typed
    }

    private suspend fun fetch(photoId: String, byteCount: Int): ByteArray? =
        runCatching { fetchBytes(photoId, byteCount) }.getOrNull()

    companion object {
        /** First read: reaches the scan in one request for an ordinary photo (EXIF + XMP + ICC headers). */
        const val INITIAL_BYTES = 128 * 1024

        /** Extra bytes fetched on a widen so the walk can read past the segment it stopped on. */
        const val SLACK_BYTES = 16 * 1024

        /** Hard ceiling for the widen step — caps Extended XMP / big ICC / malformed files. */
        const val MAX_BYTES = 1024 * 1024

        private const val MAX_WIDENINGS = 4
    }
}
