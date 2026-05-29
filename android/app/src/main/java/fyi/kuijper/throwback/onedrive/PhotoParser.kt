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
            description = if (item.has("description")) item.optString("description").ifBlank { null } else null,
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
}
