package fyi.kuijper.throwback.onedrive

import org.json.JSONObject

/**
 * Pure parser: één Graph `children`-item → [PhotoRow] (of null als het geen foto is).
 * De map waarin we crawlen levert gebeurtenis + jaar (uit het pad). Geen netwerk/IO,
 * daarom snel unit-testbaar.
 */
object PhotoParser {
    private val yearRegex = Regex("(?:19|20)\\d{2}")

    fun toPhotoRow(folderPath: String, item: JSONObject): PhotoRow? {
        val id = item.optString("id")
        if (id.isEmpty()) return null
        val photo = item.optJSONObject("photo")
        val mime = item.optJSONObject("file")?.optString("mimeType").orEmpty()
        val isImage = photo != null || mime.startsWith("image/")
        if (!isImage) return null
        return PhotoRow(
            id = id,
            name = item.optString("name"),
            event = eventFromPath(folderPath),
            year = yearFromPath(folderPath) ?: yearFromTaken(photo),
            description = if (item.has("description")) {
                item.optString("description").ifBlank { null }?.let(::unescapeHtml)
            } else null,
            taken = photo?.optString("takenDateTime")?.ifBlank { null },
            path = folderPath,
        )
    }

    /** Laatste padsegment = de gebeurtenis-map (bijv. "Bruiloft Anne & Tom"). */
    fun eventFromPath(path: String): String =
        path.substringAfter("root:", path).trim('/').substringAfterLast('/').ifBlank { "OneDrive" }

    /** Jaar uit de mapnaam — leidend boven EXIF (ADR-0002). */
    fun yearFromPath(path: String): Int? =
        path.substringAfter("root:", path).split('/').firstNotNullOfOrNull { seg ->
            yearRegex.matchEntire(seg.trim())?.value?.toIntOrNull()
        }

    private fun yearFromTaken(photo: JSONObject?): Int? =
        photo?.optString("takenDateTime").orEmpty().let { yearRegex.find(it)?.value?.toIntOrNull() }

    /**
     * Decodeert HTML-entiteiten in beschrijvingen (bv. `&amp;` → `&`, `&quot;` → `"`,
     * `&#39;`/`&#x27;` → `'`). OneDrive levert beschrijvingen soms HTML-geëncodeerd; zonder dit
     * zie je letterlijk "&quot;" in beeld. Pure Kotlin (geen android.text.Html) zodat het
     * unit-testbaar blijft.
     */
    fun unescapeHtml(input: String): String {
        if (input.indexOf('&') < 0) return input
        val out = StringBuilder(input.length)
        var i = 0
        while (i < input.length) {
            val c = input[i]
            if (c == '&') {
                val semi = input.indexOf(';', startIndex = i + 1)
                if (semi in (i + 2)..(i + 12)) {
                    val decoded = decodeEntity(input.substring(i + 1, semi))
                    if (decoded != null) {
                        out.append(decoded)
                        i = semi + 1
                        continue
                    }
                }
            }
            out.append(c)
            i++
        }
        return out.toString()
    }

    private fun decodeEntity(entity: String): String? = when {
        entity.equals("amp", ignoreCase = true) -> "&"
        entity.equals("lt", ignoreCase = true) -> "<"
        entity.equals("gt", ignoreCase = true) -> ">"
        entity.equals("quot", ignoreCase = true) -> "\""
        entity.equals("apos", ignoreCase = true) -> "'"
        entity.equals("nbsp", ignoreCase = true) -> " "
        entity.startsWith("#x", ignoreCase = true) ->
            entity.drop(2).toIntOrNull(16)?.let { runCatching { String(Character.toChars(it)) }.getOrNull() }
        entity.startsWith("#") ->
            entity.drop(1).toIntOrNull()?.let { runCatching { String(Character.toChars(it)) }.getOrNull() }
        else -> null
    }
}
