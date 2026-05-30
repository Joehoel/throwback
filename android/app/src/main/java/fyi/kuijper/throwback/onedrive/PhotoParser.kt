package fyi.kuijper.throwback.onedrive

import org.apache.commons.text.StringEscapeUtils
import org.json.JSONObject

/**
 * Pure parser: one Graph `children` item -> [PhotoRow] (or null if it is not a photo). Event and year
 * come from the folder path. No network/IO, so it stays fast to unit-test.
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
                // OneDrive sometimes returns descriptions HTML-encoded (&amp; &quot; &#39; ...);
                // decode all HTML4 entities.
                item.optString("description").ifBlank { null }?.let(StringEscapeUtils::unescapeHtml4)
            } else null,
            taken = photo?.optString("takenDateTime")?.ifBlank { null },
            path = folderPath,
            lat = item.optJSONObject("location")?.coord("latitude"),
            lon = item.optJSONObject("location")?.coord("longitude"),
        )
    }

    private fun JSONObject.coord(key: String): Double? =
        if (has(key)) optDouble(key).takeIf { !it.isNaN() } else null

    fun eventFromPath(path: String): String =
        path.substringAfter("root:", path).trim('/').substringAfterLast('/').ifBlank { "OneDrive" }

    /** Year from the folder name, preferred over EXIF (ADR-0002). */
    fun yearFromPath(path: String): Int? =
        path.substringAfter("root:", path).split('/').firstNotNullOfOrNull { seg ->
            yearRegex.matchEntire(seg.trim())?.value?.toIntOrNull()
        }

    private fun yearFromTaken(photo: JSONObject?): Int? =
        photo?.optString("takenDateTime").orEmpty().let { yearRegex.find(it)?.value?.toIntOrNull() }
}
