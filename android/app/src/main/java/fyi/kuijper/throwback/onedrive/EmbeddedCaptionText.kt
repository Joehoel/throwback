package fyi.kuijper.throwback.onedrive

/**
 * Pure (Android-free) text helpers for reading embedded captions, unit-testable on their own.
 * [ExifCaption] uses these on top of Android's ExifInterface.
 */
object EmbeddedCaptionText {

    /** Strip control/NUL chars (incl. the UTF-16 null terminator), normalize whitespace; null if empty. */
    fun clean(value: String?): String? = value
        ?.replace(Regex("\\p{Cntrl}"), " ")
        ?.replace(Regex("\\s+"), " ")
        ?.trim()
        ?.ifBlank { null }

    /**
     * Windows `XP*` tags come out of ExifInterface as comma-separated byte numbers (UTF-16LE,
     * null-terminated). Decode back to text.
     */
    fun decodeXpString(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val bytes = raw.split(',').mapNotNull { it.trim().toIntOrNull()?.toByte() }.toByteArray()
        if (bytes.isEmpty()) return null
        return clean(runCatching { String(bytes, Charsets.UTF_16LE) }.getOrNull())
    }

    fun captionFromXmp(xmp: String?): String? {
        if (xmp.isNullOrBlank()) return null
        for (tag in arrayOf("dc:description", "dc:title")) {
            val block = Regex("<$tag[^>]*>(.*?)</$tag>", setOf(RegexOption.DOT_MATCHES_ALL))
                .find(xmp)?.groupValues?.get(1) ?: continue
            // Value is often wrapped in rdf:Alt/rdf:li; strip all tags and normalize.
            clean(block.replace(Regex("<[^>]+>"), " "))?.let { return it }
        }
        return null
    }
}
