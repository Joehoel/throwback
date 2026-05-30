package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * OAuth 2.0 device authorization grant against the personal Microsoft account. No MSAL SDK needed —
 * two HTTP calls (devicecode + token) plus refresh.
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

    /** The refresh token is invalid/expired: the user must log in again. */
    class ReauthRequired(message: String) : Exception(message)

    /** Step 1: request a user code to enter on the phone. */
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

    /** Step 2: poll until the user logs in. Returns tokens or throws. */
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
                "authorization_pending" -> {} // keep polling
                "slow_down" -> intervalMs += 5000L
                else -> error(json.optString("error_description", "inloggen mislukt"))
            }
        }
        @Suppress("UNREACHABLE_CODE")
        throw IllegalStateException("unreachable")
    }

    /** Renew an expired access token using the stored refresh token. */
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
            // 60s margin so we don't use a token right as it expires.
            expiresAtMillis = System.currentTimeMillis() + (expiresIn - 60) * 1000,
        )
    }
}
