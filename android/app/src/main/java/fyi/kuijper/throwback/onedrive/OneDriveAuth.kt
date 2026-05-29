package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * OAuth 2.0 device authorization grant tegen het persoonlijke Microsoft-account.
 * Dezelfde flow die we in spike/verify_description.py bewezen: er is geen MSAL-SDK
 * nodig — twee HTTP-calls (devicecode + token) plus refresh.
 */
object OneDriveAuth {
    const val CLIENT_ID = "0bb9b8c8-a9e6-475d-b44f-74521e46aaf1"
    private const val AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0"
    private const val SCOPE = "Files.Read offline_access"

    private val http = OkHttpClient()

    data class DeviceCode(
        val deviceCode: String,
        val userCode: String,
        val verificationUri: String,
        val intervalSeconds: Int,
        val message: String,
    )

    data class Tokens(
        val accessToken: String,
        val refreshToken: String?,
        val expiresAtMillis: Long,
    )

    /** De refresh-token is ongeldig/verlopen: de gebruiker moet opnieuw inloggen. */
    class ReauthRequired(message: String) : Exception(message)

    /** Stap 1: vraag een gebruikerscode aan om op de telefoon in te voeren. */
    suspend fun startDeviceCode(): DeviceCode = withContext(Dispatchers.IO) {
        val body = FormBody.Builder()
            .add("client_id", CLIENT_ID)
            .add("scope", SCOPE)
            .build()
        val req = Request.Builder().url("$AUTHORITY/devicecode").post(body).build()
        http.newCall(req).execute().use { resp ->
            val json = JSONObject(resp.body?.string().orEmpty())
            if (!resp.isSuccessful) error(json.optString("error_description", "devicecode mislukt"))
            DeviceCode(
                deviceCode = json.getString("device_code"),
                userCode = json.getString("user_code"),
                verificationUri = json.getString("verification_uri"),
                intervalSeconds = json.optInt("interval", 5),
                message = json.optString("message"),
            )
        }
    }

    /** Stap 2: poll tot de gebruiker inlogt. Geeft tokens terug of gooit een fout. */
    suspend fun pollForTokens(dc: DeviceCode): Tokens = withContext(Dispatchers.IO) {
        var intervalMs = dc.intervalSeconds * 1000L
        while (true) {
            delay(intervalMs)
            val body = FormBody.Builder()
                .add("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
                .add("client_id", CLIENT_ID)
                .add("device_code", dc.deviceCode)
                .build()
            val req = Request.Builder().url("$AUTHORITY/token").post(body).build()
            val json = http.newCall(req).execute().use { resp ->
                JSONObject(resp.body?.string().orEmpty())
            }
            if (json.has("access_token")) return@withContext json.toTokens()
            when (json.optString("error")) {
                "authorization_pending" -> {} // gewoon doorpollen
                "slow_down" -> intervalMs += 5000L
                else -> error(json.optString("error_description", "inloggen mislukt"))
            }
        }
        @Suppress("UNREACHABLE_CODE")
        throw IllegalStateException("unreachable")
    }

    /** Verleng een verlopen access token met de bewaarde refresh token. */
    suspend fun refresh(refreshToken: String): Tokens = withContext(Dispatchers.IO) {
        val body = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("client_id", CLIENT_ID)
            .add("scope", SCOPE)
            .add("refresh_token", refreshToken)
            .build()
        val req = Request.Builder().url("$AUTHORITY/token").post(body).build()
        http.newCall(req).execute().use { resp ->
            val json = JSONObject(resp.body?.string().orEmpty())
            if (!json.has("access_token")) {
                val desc = json.optString("error_description", "verversen mislukt")
                if (json.optString("error") == "invalid_grant") throw ReauthRequired(desc)
                error(desc)
            }
            json.toTokens()
        }
    }

    private fun JSONObject.toTokens(): Tokens {
        val expiresIn = optLong("expires_in", 3600)
        return Tokens(
            accessToken = getString("access_token"),
            refreshToken = if (has("refresh_token")) getString("refresh_token") else null,
            // 60s marge zodat we niet net op de grens een verlopen token gebruiken.
            expiresAtMillis = System.currentTimeMillis() + (expiresIn - 60) * 1000,
        )
    }
}
