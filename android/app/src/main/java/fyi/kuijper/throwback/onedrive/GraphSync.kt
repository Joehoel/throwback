package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject

/**
 * Talks to Graph (no DB knowledge — [fyi.kuijper.throwback.engine.SyncEngine] handles storage). Two
 * modes:
 *  - [crawl]   : full recursive `children` crawl, delivers photos per folder batch.
 *  - [refresh] : cheap incremental update via an `@odata.deltaLink` (changes only).
 *
 * Captions that OneDrive's new storage backend no longer returns as `driveItem.description` are read
 * from the embedded photo metadata: for each description-less photo we load ~32 KB of the file and
 * [ExifCaption] extracts it (ADR-0004).
 */
class GraphSync(
    private val http: GraphHttp,
    private val descriptions: DescriptionResolver =
        DescriptionResolver({ id, byteCount -> http.getBytes("/me/drive/items/$id/content", byteCount) }),
) {
    private val select = "id,name,description,folder,file,photo,location,parentReference"

    /** Result of a [refresh]: photos to upsert, deleted ids, and the new delta token. */
    data class Changes(val upserts: List<PhotoRow>, val deletedIds: List<String>, val newDeltaLink: String?)

    /**
     * Crawls [folderId] recursively, delivering one batch per folder (already enriched with EXIF
     * captions) to [onBatch], so the caller can store + show progress while the crawl continues.
     */
    suspend fun crawl(folderId: String, onBatch: suspend (List<PhotoRow>) -> Unit) {
        val crawler = GraphCrawler { id -> fetchAllChildren(id) }
        crawler.crawl(folderId) { rows -> onBatch(enrichDescriptions(rows)) }
    }

    /**
     * Counts the media items under [folderId] by walking the tree with *listing only* — no EXIF
     * enrichment or per-item GETs — so it returns far quicker than [crawl] and can drive a live
     * "X / total" indexing denominator while the slower enriching crawl fills X in.
     */
    suspend fun countMedia(folderId: String): Int {
        var count = 0
        GraphCrawler { id -> fetchAllChildren(id) }.crawl(folderId) { rows -> count += rows.size }
        return count
    }

    /**
     * Establishes a delta token for "now" without enumerating the whole folder (`token=latest`), so
     * a later [refresh] only fetches changes since this moment.
     */
    suspend fun initDeltaToken(folderId: String): String? {
        var deltaLink: String? = null
        http.paginate("/me/drive/items/$folderId/delta?token=latest") { page ->
            page.optStringOrNull("@odata.deltaLink")?.let { deltaLink = it }
        }
        return deltaLink
    }

    /**
     * Incremental refresh from [deltaLink]. Delta omits `description`, so for each changed photo we
     * fetch the full item (with `description`) and fall back to EXIF. Returns the changes + new
     * token; writes nothing to the DB itself.
     */
    suspend fun refresh(deltaLink: String): Changes {
        val changedIds = LinkedHashSet<String>()
        val deleted = ArrayList<String>()
        var newDelta: String? = null
        http.paginate(deltaLink) { page ->
            for (o in page.objects("value")) {
                val id = o.optStringOrNull("id") ?: continue
                when {
                    o.has("deleted") -> deleted.add(id)
                    GraphSchema.isFolder(o) -> {} // skip folders; their photos arrive as separate items
                    GraphSchema.isMediaItem(o) -> changedIds.add(id)
                }
            }
            page.optStringOrNull("@odata.deltaLink")?.let { newDelta = it }
        }
        val rows = ArrayList<PhotoRow>()
        for (id in changedIds) {
            val full = runCatching { http.getJson("/me/drive/items/$id?%24select=$select") }.getOrNull() ?: continue
            val path = full.optJSONObject("parentReference")?.optString("path").orEmpty()
            PhotoParser.toPhotoRow(path, full)?.let { rows.add(it) }
        }
        return Changes(enrichDescriptions(rows), deleted, newDelta)
    }

    /** Fill in each photo's description via [DescriptionResolver] (bounded parallel content GETs). */
    private suspend fun enrichDescriptions(rows: List<PhotoRow>): List<PhotoRow> = coroutineScope {
        val gate = Semaphore(MAX_CONCURRENT_HEADS)
        rows.map { r ->
            async { gate.withPermit { r.copy(description = descriptions.resolve(r.description, r.id)) } }
        }.awaitAll()
    }

    private suspend fun fetchAllChildren(folderId: String): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        http.paginate("/me/drive/items/$folderId/children?%24select=$select&%24top=200") { page ->
            out.addAll(page.objects("value"))
        }
        return out
    }

    private companion object {
        const val MAX_CONCURRENT_HEADS = 6
    }
}
