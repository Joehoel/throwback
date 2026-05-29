package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * Vult/ververst de lokale index via Graph. Twee modi:
 *  - [sync]    : volledige recursieve `children`-crawl (eerste keer + her-crawl). `children` levert —
 *                anders dan delta — het `description`-veld (zie ADR-0004).
 *  - [refresh] : goedkope incrementele update via de bewaarde `@odata.deltaLink` (alleen wijzigingen).
 *
 * Bijschriften die OneDrive's nieuwe opslag-backend níét meer als `driveItem.description` teruggeeft,
 * halen we uit de *ingebedde* fotometadata: voor elke beschrijvingsloze foto laden we een klein stukje
 * (~32 KB) van het bestand en lezen [ExifCaption] het eruit (zie ADR-0004 update 2).
 *
 * De recursie zit in [GraphCrawler] (getest), het parsen in [PhotoParser] (getest); hier de HTTP-glue.
 */
class GraphSync(
    private val db: PhotoDb,
    private val accessToken: suspend () -> String,
    private val readCaption: (ByteArray) -> String? = ExifCaption::parse,
) {
    private val http = OkHttpClient()
    private val base = "https://graph.microsoft.com/v1.0"
    private val select = "id,name,description,folder,file,photo,location,parentReference"

    data class Result(val total: Int, val withDescription: Int)

    /** Wat een [refresh] opleverde: te upserten (gewijzigde/nieuwe) foto's en verwijderde id's. */
    data class Changes(val upserts: List<PhotoRow>, val deletedIds: List<String>)

    /**
     * Crawlt [folderId] en werkt de index incrementeel bij (upsert; wist niet vooraf). [onProgress]
     * krijgt het lopende aantal. Beschrijvingsloze foto's worden uit ingebedde EXIF/XMP aangevuld.
     */
    suspend fun sync(folderId: String, onProgress: (Int) -> Unit): Result = withContext(Dispatchers.IO) {
        val crawler = GraphCrawler { id -> fetchAllChildren(id) }
        var processed = 0
        crawler.crawl(folderId) { rows ->
            val enriched = enrichDescriptions(rows)
            db.upsertAll(enriched)
            processed += enriched.size
            onProgress(processed)
        }
        Result(db.count(), db.countWithDescription())
    }

    /**
     * Zet een delta-token voor "nu" zonder de hele map te enumereren (`token=latest`), zodat een
     * volgende [refresh] alleen wijzigingen sinds dit moment ophaalt.
     */
    suspend fun initDeltaToken(folderId: String): String? = withContext(Dispatchers.IO) {
        var url: String? = "$base/me/drive/items/$folderId/delta?token=latest"
        var deltaLink: String? = null
        while (url != null) {
            val json = getWithRetry(url)
            val next = json.optString("@odata.nextLink")
            if (next.isNotEmpty()) {
                url = next
            } else {
                deltaLink = json.optString("@odata.deltaLink").ifBlank { null }
                url = null
            }
        }
        deltaLink
    }

    /**
     * Incrementele verversing via de bewaarde [PhotoDb.deltaLink]. Delta geeft geen `description`,
     * dus voor elke gewijzigde foto halen we het volledige item op (`GET` mét `description`) en vullen
     * we eventueel uit EXIF aan. Verschuift het delta-token vooruit. Lege [Changes] als er nog geen
     * token is (dan moet eerst [sync] + [initDeltaToken] draaien).
     */
    suspend fun refresh(): Changes = withContext(Dispatchers.IO) {
        var url: String? = db.deltaLink?.ifBlank { null } ?: return@withContext Changes(emptyList(), emptyList())
        val changedIds = LinkedHashSet<String>()
        val deleted = ArrayList<String>()
        var newDelta: String? = null
        while (url != null) {
            val json = getWithRetry(url)
            json.optJSONArray("value")?.let { arr ->
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
            val next = json.optString("@odata.nextLink")
            if (next.isNotEmpty()) {
                url = next
            } else {
                newDelta = json.optString("@odata.deltaLink").ifBlank { null }
                url = null
            }
        }
        val rows = ArrayList<PhotoRow>()
        for (id in changedIds) {
            val full = runCatching { getWithRetry("$base/me/drive/items/$id?%24select=$select") }.getOrNull() ?: continue
            val path = full.optJSONObject("parentReference")?.optString("path").orEmpty()
            PhotoParser.toPhotoRow(path, full)?.let { rows.add(it) }
        }
        val enriched = enrichDescriptions(rows)
        if (newDelta != null) db.deltaLink = newDelta
        Changes(enriched, deleted)
    }

    /** Vul ontbrekende beschrijvingen aan uit ingebedde fotometadata (begrensde parallelliteit). */
    private suspend fun enrichDescriptions(rows: List<PhotoRow>): List<PhotoRow> = coroutineScope {
        val gate = Semaphore(MAX_CONCURRENT_HEADS)
        rows.map { r ->
            if (!r.description.isNullOrBlank()) async { r }
            else async {
                gate.withPermit {
                    val caption = runCatching { fetchHead(r.id, HEAD_BYTES) }.getOrNull()?.let(readCaption)
                    if (caption != null) r.copy(description = caption) else r
                }
            }
        }.awaitAll()
    }

    /** Eerste [bytes] bytes van het bestand (Range-request) — genoeg voor de EXIF/XMP vooraan. */
    private suspend fun fetchHead(id: String, bytes: Int): ByteArray? {
        val token = accessToken()
        val req = Request.Builder()
            .url("$base/me/drive/items/$id/content")
            .header("Authorization", "Bearer $token")
            .header("Range", "bytes=0-${bytes - 1}")
            .build()
        return http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) null else resp.body?.byteStream()?.readUpTo(bytes)
        }
    }

    /** Alle children van een map, paginatie afgehandeld. */
    private suspend fun fetchAllChildren(folderId: String): List<JSONObject> {
        var url = "$base/me/drive/items/$folderId/children?%24select=$select&%24top=200"
        val out = ArrayList<JSONObject>()
        while (true) {
            val json = getWithRetry(url)
            json.optJSONArray("value")?.let { arr ->
                for (i in 0 until arr.length()) out.add(arr.getJSONObject(i))
            }
            val next = json.optString("@odata.nextLink")
            if (next.isEmpty()) break
            url = next
        }
        return out
    }

    private suspend fun getWithRetry(url: String): JSONObject {
        var attempt = 0
        while (true) {
            val token = accessToken()
            val req = Request.Builder().url(url).header("Authorization", "Bearer $token").build()
            val retryAfter = http.newCall(req).execute().use { resp ->
                if (resp.code == 429 || resp.code == 503) {
                    if (attempt++ > 8) error("Te vaak afgeknepen door Graph")
                    resp.header("Retry-After")?.toLongOrNull() ?: 5L
                } else {
                    val json = JSONObject(resp.body?.string().orEmpty())
                    if (!resp.isSuccessful) {
                        error(json.optJSONObject("error")?.optString("message") ?: "Graph-fout ${resp.code}")
                    }
                    return json
                }
            }
            delay(retryAfter * 1000)
        }
        @Suppress("UNREACHABLE_CODE")
        throw IllegalStateException("unreachable")
    }

    private fun InputStream.readUpTo(n: Int): ByteArray {
        val buf = ByteArrayOutputStream(minOf(n, 64 * 1024))
        val chunk = ByteArray(8192)
        var total = 0
        while (total < n) {
            val read = read(chunk, 0, minOf(chunk.size, n - total))
            if (read < 0) break
            buf.write(chunk, 0, read)
            total += read
        }
        return buf.toByteArray()
    }

    private companion object {
        const val HEAD_BYTES = 32 * 1024
        const val MAX_CONCURRENT_HEADS = 6
    }
}
