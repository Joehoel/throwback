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
            val (folders, items) = fetchChildren(folderId).partition { GraphSchema.isFolder(it) }
            folders.forEach { queue.add(it.getString("id")) }
            if (items.isEmpty()) continue
            // Children of one folder share a parentReference path, so derive it once.
            val folderPath = items.first().optJSONObject("parentReference")?.optString("path").orEmpty()
            val rows = PhotoParser.toPhotoRows(folderPath, items)
            if (rows.isNotEmpty()) onBatch(rows)
        }
    }
}
