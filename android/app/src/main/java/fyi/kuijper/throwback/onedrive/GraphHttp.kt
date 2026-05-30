package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * Low-level transport naar Microsoft Graph: bezit de éne OkHttp-client, plakt het Bearer-token,
 * loopt `@odata.nextLink`-paginatie af, vertaalt Graph-fouten naar excepties (incl. 401 →
 * [OneDriveAuth.ReauthRequired]) en wacht 429/503 met `Retry-After` uit. De feature-modules
 * ([GraphClient], [GraphMedia], [GraphSync]) kennen alleen Graph's *resource-vormen* — welke paden,
 * welke `$select`-velden — niet dít transport.
 *
 * Het is een interface (niet enkel een class) zodat die feature-modules in tests een nep-transport
 * met ingeblikte JSON krijgen — dezelfde injecteerbare-fetcher-aanpak als [GraphCrawler].
 */
interface GraphHttp {
    /**
     * GET de JSON op [pathOrUrl] — relatief t.o.v. de Graph-base (`/me/drive/...`) of een absolute
     * vervolg-URL (een `@odata.nextLink`/`deltaLink`). Gooit bij élke fout (404 incluis).
     */
    suspend fun getJson(pathOrUrl: String): JSONObject

    /** Als [getJson], maar geeft `null` bij een 404 (legitiem afwezig) i.p.v. te gooien. */
    suspend fun getJsonOrNull(pathOrUrl: String): JSONObject?

    /** Eerste [byteCount] bytes van [pathOrUrl] (Range-request); best-effort, `null` bij mislukken. */
    suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray?

    /**
     * Loopt `@odata.nextLink` af en geeft elke pagina aan [onPage]. Gebouwd op [getJson], zodat élke
     * nep-transport deze lus vanzelf meeoefent; de aanroeper haalt zelf `value`/`@odata.deltaLink`
     * uit elke pagina (de terminale waarde verschilt per aanroeper, dus die blijft zichtbaar bij hem).
     */
    suspend fun paginate(firstPathOrUrl: String, onPage: (JSONObject) -> Unit) {
        var url: String? = firstPathOrUrl
        while (url != null) {
            val page = getJson(url)
            onPage(page)
            url = page.optString("@odata.nextLink").ifBlank { null }
        }
    }
}

/** De echte [GraphHttp]: één gedeelde OkHttp-client, token via [accessToken]. */
class OkHttpGraphHttp(
    private val accessToken: suspend () -> String,
    private val base: String = "https://graph.microsoft.com/v1.0",
) : GraphHttp {
    private val http = OkHttpClient()

    override suspend fun getJson(pathOrUrl: String): JSONObject =
        request(pathOrUrl) ?: error("Graph: niet gevonden (404) — $pathOrUrl")

    override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = request(pathOrUrl)

    override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(urlOf(pathOrUrl))
            .header("Authorization", "Bearer ${accessToken()}")
            .header("Range", "bytes=0-${byteCount - 1}")
            .build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) null else resp.body?.byteStream()?.readUpTo(byteCount)
        }
    }

    /**
     * GET met centrale foutafhandeling: `null` bij 404, [OneDriveAuth.ReauthRequired] bij 401,
     * 429/503 worden met `Retry-After` opnieuw geprobeerd, overige fouten worden gegooid.
     */
    private suspend fun request(pathOrUrl: String): JSONObject? = withContext(Dispatchers.IO) {
        val url = urlOf(pathOrUrl)
        var attempt = 0
        while (true) {
            val token = accessToken()
            val req = Request.Builder().url(url).header("Authorization", "Bearer $token").build()
            val retryAfterSeconds = http.newCall(req).execute().use { resp ->
                when {
                    resp.code == 404 -> return@withContext null
                    resp.code == 401 -> throw OneDriveAuth.ReauthRequired("Graph weigerde het token (401)")
                    resp.code == 429 || resp.code == 503 -> {
                        if (attempt++ > 8) error("Te vaak afgeknepen door Graph")
                        resp.header("Retry-After")?.toLongOrNull() ?: 5L
                    }
                    else -> {
                        val json = JSONObject(resp.body?.string().orEmpty())
                        if (!resp.isSuccessful) {
                            error(json.optJSONObject("error")?.optString("message") ?: "Graph-fout ${resp.code}")
                        }
                        return@withContext json
                    }
                }
            }
            delay(retryAfterSeconds * 1000)
        }
        @Suppress("UNREACHABLE_CODE")
        null
    }

    private fun urlOf(pathOrUrl: String) =
        if (pathOrUrl.startsWith("http")) pathOrUrl else base + pathOrUrl

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
}
