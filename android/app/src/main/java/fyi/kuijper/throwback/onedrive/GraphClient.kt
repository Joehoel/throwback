package fyi.kuijper.throwback.onedrive

data class DriveItem(
    val id: String,
    val name: String,
    val childCount: Int,
)

/**
 * Microsoft Graph access for the folder picker: reads a folder's subfolders. Transport (token,
 * retry, error translation, pagination) lives in [GraphHttp]; here we only know paths + `$select`.
 */
class GraphClient(private val http: GraphHttp) {

    /**
     * A OneDrive "special folder" (e.g. "cameraroll" or "photos"), or null if it doesn't exist on
     * this account. With only Files.Read, Graph returns 404 for a missing special folder —
     * [GraphHttp.getJsonOrNull] turns that into "absent".
     */
    suspend fun specialFolder(name: String): DriveItem? {
        val o = http.getJsonOrNull("/me/drive/special/$name?%24select=id,name,folder") ?: return null
        val folder = o.optJSONObject("folder") ?: return null
        return DriveItem(
            id = o.getString("id"),
            name = o.getString("name"),
            childCount = folder.optInt("childCount", 0),
        )
    }

    suspend fun listFolders(folderId: String?): List<DriveItem> {
        val first = if (folderId == null) {
            "/me/drive/root/children"
        } else {
            "/me/drive/items/$folderId/children"
        }
        // $-parameters URL-encoded (%24) to avoid Kotlin string-template interpolation.
        val out = ArrayList<DriveItem>()
        http.paginate("$first?%24select=id,name,folder&%24top=200") { page ->
            for (o in page.objects("value")) {
                val folder = o.optJSONObject("folder") ?: continue // folders only
                out.add(
                    DriveItem(
                        id = o.getString("id"),
                        name = o.getString("name"),
                        childCount = folder.optInt("childCount", 0),
                    )
                )
            }
        }
        return out.sortedBy { it.name.lowercase() }
    }
}
