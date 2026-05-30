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
        DescriptionResolver({ id -> http.getBytes("/me/drive/items/$id/content", HEAD_BYTES) }),
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
     * Establishes a delta token for "now" without enumerating the whole folder (`token=latest`), so
     * a later [refresh] only fetches changes since this moment.
     */
    suspend fun initDeltaToken(folderId: String): String? {
        var deltaLink: String? = null
        http.paginate("/me/drive/items/$folderId/delta?token=latest") { page ->
            page.optString("@odata.deltaLink").ifBlank { null }?.let { deltaLink = it }
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
            page.optJSONArray("value")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val id = o.optString("id").ifBlank { null } ?: continue
                    val mime = o.optJSONObject("file")?.optString("mimeType").orEmpty()
                    when {
                        o.has("deleted") -> deleted.add(id)
                        o.has("folder") -> {} // skip folders; their photos arrive as separate items
                        o.has("photo") || mime.startsWith("image/") -> changedIds.add(id)
                    }
                }
            }
            page.optString("@odata.deltaLink").ifBlank { null }?.let { newDelta = it }
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
            page.optJSONArray("value")?.let { arr ->
                for (i in 0 until arr.length()) out.add(arr.getJSONObject(i))
            }
        }
        return out
    }

    private companion object {
        const val HEAD_BYTES = 32 * 1024
        const val MAX_CONCURRENT_HEADS = 6
    }
}
