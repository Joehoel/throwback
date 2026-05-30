package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject

/**
 * Praat met Graph (geen DB-kennis — [fyi.kuijper.throwback.engine.SyncEngine] doet de opslag). Twee
 * modi:
 *  - [crawl]   : volledige recursieve `children`-crawl, levert foto's per map-batch aan de aanroeper.
 *  - [refresh] : goedkope incrementele update via een `@odata.deltaLink` (alleen wijzigingen).
 *
 * Transport (token, retry, paginatie, foutvertaling) zit in [GraphHttp]; hier kennen we alleen de
 * Graph-paden + de resource-vorm. Bijschriften die OneDrive's nieuwe opslag-backend níét meer als
 * `driveItem.description` teruggeeft, halen we uit de *ingebedde* fotometadata: voor elke
 * beschrijvingsloze foto laden we ~32 KB van het bestand en leest [ExifCaption] het eruit (ADR-0004).
 */
class GraphSync(
    private val http: GraphHttp,
    private val readCaption: (ByteArray) -> String? = ExifCaption::parse,
) {
    private val select = "id,name,description,folder,file,photo,location,parentReference"

    /** Resultaat van een [refresh]: te upserten foto's, verwijderde id's, en het nieuwe delta-token. */
    data class Changes(val upserts: List<PhotoRow>, val deletedIds: List<String>, val newDeltaLink: String?)

    /**
     * Crawlt [folderId] recursief en levert per map een batch (al verrijkt met EXIF-bijschriften) aan
     * [onBatch], zodat de aanroeper kan opslaan + voortgang tonen terwijl de crawl doorloopt.
     */
    suspend fun crawl(folderId: String, onBatch: suspend (List<PhotoRow>) -> Unit) {
        val crawler = GraphCrawler { id -> fetchAllChildren(id) }
        crawler.crawl(folderId) { rows -> onBatch(enrichDescriptions(rows)) }
    }

    /**
     * Zet een delta-token voor "nu" zonder de hele map te enumereren (`token=latest`), zodat een
     * volgende [refresh] alleen wijzigingen sinds dit moment ophaalt.
     */
    suspend fun initDeltaToken(folderId: String): String? {
        var deltaLink: String? = null
        http.paginate("/me/drive/items/$folderId/delta?token=latest") { page ->
            page.optString("@odata.deltaLink").ifBlank { null }?.let { deltaLink = it }
        }
        return deltaLink
    }

    /**
     * Incrementele verversing vanaf [deltaLink]. Delta geeft geen `description`, dus voor elke
     * gewijzigde foto halen we het volledige item op (mét `description`) en vullen we eventueel uit
     * EXIF aan. Geeft de wijzigingen + het nieuwe token terug; schrijft zelf niets naar de DB.
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
                        o.has("folder") -> {} // mappen slaan we over; hun foto's komen als losse items
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

    /** Vul ontbrekende beschrijvingen aan uit ingebedde fotometadata (begrensde parallelliteit). */
    private suspend fun enrichDescriptions(rows: List<PhotoRow>): List<PhotoRow> = coroutineScope {
        val gate = Semaphore(MAX_CONCURRENT_HEADS)
        rows.map { r ->
            if (!r.description.isNullOrBlank()) async { r }
            else async {
                gate.withPermit {
                    val caption = runCatching { http.getBytes("/me/drive/items/${r.id}/content", HEAD_BYTES) }
                        .getOrNull()?.let(readCaption)
                    if (caption != null) r.copy(description = caption) else r
                }
            }
        }.awaitAll()
    }

    /** Alle children van een map, paginatie afgehandeld. */
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
