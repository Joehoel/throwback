package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Levert een TV-formaat thumbnail-URL voor een foto. Graph maakt thumbnails als
 * JPEG, ongeacht het bronformaat (HEIC/PNG/…), dus dit ondersteunt alle formaten.
 * URL's zijn kortlevend → vlak vóór weergave ophalen, niet bewaren (ADR-0004).
 */
class GraphMedia(private val accessToken: suspend () -> String) {
    private val http = OkHttpClient()
    private val base = "https://graph.microsoft.com/v1.0"

    suspend fun thumbnailUrl(id: String): String? = withContext(Dispatchers.IO) {
        val url = "$base/me/drive/items/$id/thumbnails/0/large"
        val req = Request.Builder().url(url).header("Authorization", "Bearer ${accessToken()}").build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            JSONObject(resp.body?.string().orEmpty()).optString("url").ifBlank { null }
        }
    }
}
