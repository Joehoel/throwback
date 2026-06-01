package fyi.kuijper.throwback.onedrive

import android.content.Context

/**
 * App-private storage of the refresh token and chosen root folder. v1: plain SharedPreferences
 * (sandboxed per app). To be hardened later with EncryptedSharedPreferences — see PRD "Open punten".
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

    /** The drive owner's Graph id, cached after the first lookup so later boots identify without a call. */
    var ownerId: String?
        get() = prefs.getString("owner_id", null)
        set(value) { prefs.edit().putString("owner_id", value).apply() }

    val isConnected: Boolean get() = refreshToken != null
    val hasFolder: Boolean get() = folderId != null

    fun clear() = prefs.edit().clear().apply()
}
