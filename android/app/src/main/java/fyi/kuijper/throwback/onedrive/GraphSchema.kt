package fyi.kuijper.throwback.onedrive

import org.json.JSONObject

/** Predicates over a raw Graph `driveItem`, so field-name knowledge lives in one place. */
object GraphSchema {
    fun isFolder(item: JSONObject): Boolean = item.has("folder")

    fun isMediaItem(item: JSONObject): Boolean =
        item.has("photo") || mimeType(item).startsWith("image/")

    fun mimeType(item: JSONObject): String =
        item.optJSONObject("file")?.optString("mimeType").orEmpty()
}
