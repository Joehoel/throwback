package fyi.kuijper.throwback.onedrive

import org.json.JSONObject

/**
 * Recursively walks a OneDrive folder, yielding its photos (via [PhotoParser]). The fetch is
 * injectable ([fetchChildren]) so the recursion is unit-testable without a network; the real
 * fetcher talks to Graph (see [GraphSync]).
 */
class GraphCrawler(
    private val fetchChildren: suspend (folderId: String) -> List<JSONObject>,
) {
    /**
     * Crawls from [rootFolderId] breadth-first. [onBatch] receives the photos found per folder (so
     * the caller can stream them into the index + show progress).
     */
    suspend fun crawl(rootFolderId: String, onBatch: suspend (List<PhotoRow>) -> Unit) {
        val queue = ArrayDeque<String>()
        queue.add(rootFolderId)
        while (queue.isNotEmpty()) {
            val folderId = queue.removeFirst()
            val rows = ArrayList<PhotoRow>()
            for (item in fetchChildren(folderId)) {
                if (GraphSchema.isFolder(item)) {
                    queue.add(item.getString("id")) // subfolder: walk later
                    continue
                }
                val path = item.optJSONObject("parentReference")?.optString("path").orEmpty()
                PhotoParser.toPhotoRow(path, item)?.let { rows.add(it) }
            }
            if (rows.isNotEmpty()) onBatch(rows)
        }
    }
}
