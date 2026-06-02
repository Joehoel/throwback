package fyi.kuijper.throwback.onedrive

import io.sentry.okhttp.SentryOkHttpInterceptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * Low-level transport to Microsoft Graph: owns the single OkHttp client, attaches the Bearer token,
 * walks `@odata.nextLink` pagination, translates Graph errors to exceptions (incl. 401 →
 * [OneDriveAuth.ReauthRequired]) and honours 429/503 `Retry-After`. The feature modules
 * ([GraphClient], [GraphMedia], [GraphSync]) only know Graph's resource shapes, not this transport.
 *
 * An interface (not just a class) so those feature modules get a fake transport with canned JSON in
 * tests — same injectable-fetcher approach as [GraphCrawler].
 */
interface GraphHttp {
    /**
     * GET the JSON at [pathOrUrl] — relative to the Graph base (`/me/drive/...`) or an absolute
     * continuation URL (`@odata.nextLink`/`deltaLink`). Throws on any error (404 included).
     */
    suspend fun getJson(pathOrUrl: String): JSONObject

    /** Like [getJson], but returns `null` on 404 (legitimately absent) instead of throwing. */
    suspend fun getJsonOrNull(pathOrUrl: String): JSONObject?

    /** First [byteCount] bytes of [pathOrUrl] (Range request); best-effort, `null` on failure. */
    suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray?

    /**
     * Walks `@odata.nextLink`, handing each page to [onPage]. Built on [getJson] so every fake
     * transport exercises this loop for free; the caller extracts `value`/`@odata.deltaLink` itself
     * (the terminal value differs per caller).
     */
    suspend fun paginate(firstPathOrUrl: String, onPage: (JSONObject) -> Unit) {
        var url: String? = firstPathOrUrl
        while (url != null) {
            val page = getJson(url)
            onPage(page)
            url = page.optStringOrNull("@odata.nextLink")
        }
    }
}

/** The real [GraphHttp]: one shared OkHttp client, token via [accessToken]. */
class OkHttpGraphHttp(
    private val accessToken: suspend () -> String,
    private val base: String = "https://graph.microsoft.com/v1.0",
) : GraphHttp {
    // Sentry interceptor → an http.client span per Graph call (nested under the active index/auth
    // transaction) plus breadcrumbs; it never reads the Authorization header or request body.
    private val http = OkHttpClient.Builder()
        .addInterceptor(SentryOkHttpInterceptor())
        .build()

    override suspend fun getJson(pathOrUrl: String): JSONObject =
        request(pathOrUrl) ?: error("Graph: niet gevonden (404) — $pathOrUrl")

    override suspend fun getJsonOrNull(pathOrUrl: String): JSONObject? = request(pathOrUrl)

    // Best-effort: a transient throttle must not silently drop the embedded caption (it would stick as
    // a null description until the next full re-crawl), so it shares the same 429/503 backoff as the
    // JSON path and just folds a final give-up (or any other failure) into null.
    override suspend fun getBytes(pathOrUrl: String, byteCount: Int): ByteArray? = runCatching {
        withThrottleRetry({ token ->
            Request.Builder()
                .url(urlOf(pathOrUrl))
                .header("Authorization", "Bearer $token")
                .header("Range", "bytes=0-${byteCount - 1}")
                .build()
        }) { resp -> if (resp.isSuccessful) resp.body?.byteStream()?.readUpTo(byteCount) else null }
    }.getOrNull()

    /**
     * GET with central error handling: `null` on 404, [OneDriveAuth.ReauthRequired] on 401, other
     * errors thrown. (429/503 backoff is handled by [withThrottleRetry].)
     */
    private suspend fun request(pathOrUrl: String): JSONObject? =
        withThrottleRetry({ token -> Request.Builder().url(urlOf(pathOrUrl)).header("Authorization", "Bearer $token").build() }) { resp ->
            when (resp.code) {
                404 -> null
                401 -> throw OneDriveAuth.ReauthRequired("Graph weigerde het token (401)")
                else -> JSONObject(resp.body?.string().orEmpty()).also {
                    if (!resp.isSuccessful) error(it.optJSONObject("error")?.optString("message") ?: "Graph-fout ${resp.code}")
                }
            }
        }

    /**
     * Runs [buildRequest] (with a fresh bearer token) and hands the response to [handle], transparently
     * retrying 429/503 per `Retry-After` (capped at [MAX_THROTTLE_RETRIES]). [handle] therefore never
     * sees a 429/503; it returns the final value or throws.
     */
    private suspend fun <T> withThrottleRetry(
        buildRequest: (token: String) -> Request,
        handle: (Response) -> T,
    ): T = withContext(Dispatchers.IO) {
        var attempt = 0
        while (true) {
            val req = buildRequest(accessToken())
            val retryAfterSeconds = http.newCall(req).execute().use { resp ->
                if (resp.code == 429 || resp.code == 503) {
                    if (attempt++ > MAX_THROTTLE_RETRIES) error("Te vaak afgeknepen door Graph")
                    resp.header("Retry-After")?.toLongOrNull() ?: 5L
                } else {
                    return@withContext handle(resp)
                }
            }
            delay(retryAfterSeconds * 1000)
        }
        @Suppress("UNREACHABLE_CODE")
        error("unreachable")
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

    private companion object {
        const val MAX_THROTTLE_RETRIES = 8
    }
}
