package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Vult de lokale index via een recursieve `children`-crawl van de gekozen map.
 * `children` levert — anders dan delta — wél het `description`-veld (zie ADR-0004 update).
 * De recursie zit in [GraphCrawler] (getest), het parsen in [PhotoParser] (getest);
 * hier alleen de HTTP-glue + paginatie.
 */
class GraphSync(
    private val db: PhotoDb,
    private val accessToken: suspend () -> String,
) {
    private val http = OkHttpClient()
    private val base = "https://graph.microsoft.com/v1.0"

    data class Result(val total: Int, val withDescription: Int)

    /**
     * Crawlt [folderId] en werkt de index incrementeel bij (upsert; wist niet vooraf, zodat
     * een achtergrond-verversing de lopende show niet leegmaakt). Bij een nieuwe map wist de
     * aanroeper de index expliciet vóór de crawl. [onProgress] krijgt het lopende aantal.
     */
    suspend fun sync(folderId: String, onProgress: (Int) -> Unit): Result = withContext(Dispatchers.IO) {
        val crawler = GraphCrawler { id -> fetchAllChildren(id) }
        var processed = 0
        crawler.crawl(folderId) { rows ->
            db.upsertAll(rows)
            processed += rows.size
            onProgress(processed)
        }
        Result(db.count(), db.countWithDescription())
    }

    /** Alle children van een map, paginatie afgehandeld. */
    private suspend fun fetchAllChildren(folderId: String): List<JSONObject> {
        val select = "id,name,description,folder,file,photo,location,parentReference"
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
}
