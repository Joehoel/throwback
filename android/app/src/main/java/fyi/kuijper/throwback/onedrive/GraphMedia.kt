package fyi.kuijper.throwback.onedrive

/**
 * Provides a TV-sized thumbnail URL for a photo. Graph renders thumbnails as JPEG regardless of
 * source format (HEIC/PNG/…), so all formats are supported. URLs are short-lived → fetch just
 * before display, don't persist (ADR-0004).
 *
 * We request a custom `c1920x1920` bounding box rather than the predefined `large` (≤800px longest
 * edge): on a 1080p/4K panel 800px is a heavy upscale, made worse by the Ken Burns zoom. The box is
 * square so the *longest* edge is 1920 for both orientations — a 1920x1080 box would cap a portrait
 * photo at 1080px tall, where the Fit layout (SlideshowCanvas) needs its height. Graph fits within
 * the box (no crop), preserving aspect. This realises ADR-0004's stated "~1920px" intent.
 *
 * TRAP: a custom size is *not* a path segment like `large`/`medium`/`small`. Addressing it as
 * `/thumbnails/0/c1920x1920` makes Graph reject the whole OData path ("must end with the navigation
 * property…"). Custom sizes must be requested via `$select` on the thumbnail set; the URL then comes
 * back as a property named after the size (`{ "c1920x1920": { "url": … } }`).
 *
 * A missing thumbnail (404) is legitimate → `null`; a transient error (503) throws and is
 * deliberately caught by [fyi.kuijper.throwback.engine.SlideshowEngine] into an offline hint.
 */
class GraphMedia(private val http: GraphHttp) {

    suspend fun thumbnailUrl(id: String): String? =
        http.getJsonOrNull("/me/drive/items/$id/thumbnails/0?\$select=$SIZE")
            ?.optJSONObject(SIZE)
            ?.optString("url")
            ?.ifBlank { null }

    private companion object {
        // Custom thumbnail size string (fit-within bounding box, aspect preserved — no `_crop`).
        const val SIZE = "c1920x1920"
    }
}
