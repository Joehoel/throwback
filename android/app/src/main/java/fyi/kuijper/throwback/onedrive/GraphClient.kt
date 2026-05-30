package fyi.kuijper.throwback.onedrive

data class DriveItem(
    val id: String,
    val name: String,
    val childCount: Int,
)

/**
 * Microsoft Graph-toegang voor de map-kiezer: leest de submappen van een map. Transport (token,
 * retry, foutvertaling, paginatie) zit in [GraphHttp]; hier kennen we alleen de paden + `$select`.
 */
class GraphClient(private val http: GraphHttp) {

    /**
     * Een "special folder" van OneDrive (bv. "cameraroll" of "photos"), of null als die
     * niet bestaat op dit account. Bij alleen Files.Read geeft Graph 404 voor een ontbrekende
     * special folder — [GraphHttp.getJsonOrNull] maakt daar gewoon "niet aanwezig" van.
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

    /** Submappen van [folderId], of van de root als [folderId] null is. Paginatie afgehandeld. */
    suspend fun listFolders(folderId: String?): List<DriveItem> {
        val first = if (folderId == null) {
            "/me/drive/root/children"
        } else {
            "/me/drive/items/$folderId/children"
        }
        // $-parameters URL-geëncodeerd (%24) om Kotlin string-templates te vermijden.
        val out = ArrayList<DriveItem>()
        http.paginate("$first?%24select=id,name,folder&%24top=200") { page ->
            val arr = page.getJSONArray("value")
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val folder = o.optJSONObject("folder") ?: continue // alleen mappen
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
