package fyi.kuijper.throwback.onedrive

/**
 * Provides a TV-sized thumbnail URL for a photo. Graph renders thumbnails as JPEG regardless of
 * source format (HEIC/PNG/…), so all formats are supported. URLs are short-lived → fetch just
 * before display, don't persist (ADR-0004).
 *
 * A missing thumbnail (404) is legitimate → `null`; a transient error (503) throws and is
 * deliberately caught by [fyi.kuijper.throwback.engine.SlideshowEngine] into an offline hint.
 */
class GraphMedia(private val http: GraphHttp) {

    suspend fun thumbnailUrl(id: String): String? =
        http.getJsonOrNull("/me/drive/items/$id/thumbnails/0/large")
            ?.optString("url")
            ?.ifBlank { null }
}
