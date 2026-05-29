package fyi.kuijper.throwback.onedrive

import android.content.Context

/**
 * App-privé opslag van de refresh token en de gekozen hoofdmap.
 * v1: gewone SharedPreferences (sandboxed per app). Later hardenen met
 * EncryptedSharedPreferences — zie PRD "Open punten".
 */
class TokenStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("throwback_onedrive", Context.MODE_PRIVATE)

    var refreshToken: String?
        get() = prefs.getString("refresh_token", null)
        set(value) { prefs.edit().putString("refresh_token", value).apply() }

    var folderId: String?
        get() = prefs.getString("folder_id", null)
        set(value) { prefs.edit().putString("folder_id", value).apply() }

    var folderName: String?
        get() = prefs.getString("folder_name", null)
        set(value) { prefs.edit().putString("folder_name", value).apply() }

    val isConnected: Boolean get() = refreshToken != null
    val hasFolder: Boolean get() = folderId != null

    fun clear() = prefs.edit().clear().apply()
}
