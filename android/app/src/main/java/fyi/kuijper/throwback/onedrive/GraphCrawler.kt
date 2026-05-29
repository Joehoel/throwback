package fyi.kuijper.throwback.onedrive

import org.json.JSONObject

/**
 * Loopt een OneDrive-map recursief af en levert de foto's eruit (via [PhotoParser]).
 * De manier van ophalen is injecteerbaar ([fetchChildren]) zodat de recursie zonder
 * netwerk unit-testbaar is; de echte fetcher praat met Graph (zie [GraphSync]).
 */
class GraphCrawler(
    private val fetchChildren: suspend (folderId: String) -> List<JSONObject>,
) {
    /**
     * Crawlt vanaf [rootFolderId] breedte-eerst. [onBatch] krijgt per map de gevonden
     * foto's (zodat de aanroeper kan streamen naar de index + voortgang tonen).
     */
    suspend fun crawl(rootFolderId: String, onBatch: suspend (List<PhotoRow>) -> Unit) {
        val queue = ArrayDeque<String>()
        queue.add(rootFolderId)
        while (queue.isNotEmpty()) {
            val folderId = queue.removeFirst()
            val rows = ArrayList<PhotoRow>()
            for (item in fetchChildren(folderId)) {
                if (item.has("folder")) {
                    queue.add(item.getString("id")) // submap: later aflopen
                    continue
                }
                val path = item.optJSONObject("parentReference")?.optString("path").orEmpty()
                PhotoParser.toPhotoRow(path, item)?.let { rows.add(it) }
            }
            if (rows.isNotEmpty()) onBatch(rows)
        }
    }
}
