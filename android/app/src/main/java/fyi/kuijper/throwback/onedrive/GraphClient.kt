package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

data class DriveItem(
    val id: String,
    val name: String,
    val childCount: Int,
)

/**
 * Microsoft Graph-toegang. Voor de map-kiezer in Fase 1 lezen we alleen de
 * submappen van een map. [accessToken] levert een geldig (zo nodig ververst) token.
 */
class GraphClient(private val accessToken: suspend () -> String) {
    private val http = OkHttpClient()
    private val base = "https://graph.microsoft.com/v1.0"

    /** Submappen van [folderId], of van de root als [folderId] null is. */
    suspend fun listFolders(folderId: String?): List<DriveItem> = withContext(Dispatchers.IO) {
        val path = if (folderId == null) {
            "$base/me/drive/root/children"
        } else {
            "$base/me/drive/items/$folderId/children"
        }
        // $-parameters URL-geëncodeerd (%24) om Kotlin string-templates te vermijden.
        val url = "$path?%24select=id,name,folder&%24top=200"
        val token = accessToken()
        val req = Request.Builder().url(url).header("Authorization", "Bearer $token").build()
        http.newCall(req).execute().use { resp ->
            val json = JSONObject(resp.body?.string().orEmpty())
            if (!resp.isSuccessful) {
                error(json.optJSONObject("error")?.optString("message") ?: "Graph-fout")
            }
            val arr = json.getJSONArray("value")
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val folder = o.optJSONObject("folder") ?: continue // alleen mappen
                    add(
                        DriveItem(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            childCount = folder.optInt("childCount", 0),
                        )
                    )
                }
            }.sortedBy { it.name.lowercase() }
        }
    }
}
