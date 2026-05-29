package fyi.kuijper.throwback.onedrive

/**
 * Pure (Android-vrije) tekst-helpers voor het uitlezen van ingebedde bijschriften, los unit-testbaar.
 * [ExifCaption] gebruikt deze bovenop Android's ExifInterface.
 */
object EmbeddedCaptionText {

    /** Strip control-/NUL-tekens (o.a. de UTF-16 null-terminator), normaliseer witruimte; null bij leeg. */
    fun clean(value: String?): String? = value
        ?.replace(Regex("\\p{Cntrl}"), " ")
        ?.replace(Regex("\\s+"), " ")
        ?.trim()
        ?.ifBlank { null }

    /**
     * De Windows `XP*`-tags komen uit ExifInterface als komma-gescheiden byte-getallen
     * (UTF-16LE, null-getermineerd). Decodeer terug naar tekst.
     */
    fun decodeXpString(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val bytes = raw.split(',').mapNotNull { it.trim().toIntOrNull()?.toByte() }.toByteArray()
        if (bytes.isEmpty()) return null
        return clean(runCatching { String(bytes, Charsets.UTF_16LE) }.getOrNull())
    }

    /** Pak `dc:description` (anders `dc:title`) uit een XMP-packet. */
    fun captionFromXmp(xmp: String?): String? {
        if (xmp.isNullOrBlank()) return null
        for (tag in arrayOf("dc:description", "dc:title")) {
            val block = Regex("<$tag[^>]*>(.*?)</$tag>", setOf(RegexOption.DOT_MATCHES_ALL))
                .find(xmp)?.groupValues?.get(1) ?: continue
            // Waarde zit vaak in een rdf:Alt/rdf:li; strip alle tags en normaliseer.
            clean(block.replace(Regex("<[^>]+>"), " "))?.let { return it }
        }
        return null
    }
}
