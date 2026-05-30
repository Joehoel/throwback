package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Owns the OneDrive connection: token cache, automatic refresh, device-code login and disconnect.
 * The refresh token is persisted in [TokenStore]; the access token lives only in memory. The
 * [Mutex] prevents the slideshow and sync engines from refreshing simultaneously (they now share
 * one session). The folder choice stays owned by [TokenStore] itself (see [store]).
 */
class Session(val store: TokenStore) {

    @Volatile
    private var tokens: OneDriveAuth.Tokens? = null
    private val refreshLock = Mutex()

    val isConnected: Boolean get() = store.isConnected
    val hasFolder: Boolean get() = store.hasFolder

    /** A valid access token, refreshed (thread-safe) if needed. Throws [OneDriveAuth.ReauthRequired]. */
    suspend fun accessToken(): String {
        tokens?.let { if (it.expiresAtMillis > System.currentTimeMillis()) return it.accessToken }
        return refreshLock.withLock {
            // Double-check: another coroutine may have refreshed while we waited for the lock.
            tokens?.let { if (it.expiresAtMillis > System.currentTimeMillis()) return it.accessToken }
            val rt = store.refreshToken ?: error("Niet gekoppeld")
            val fresh = OneDriveAuth.refresh(rt)
            tokens = fresh
            fresh.refreshToken?.let { store.refreshToken = it }
            fresh.accessToken
        }
    }

    suspend fun startDeviceCode(): OneDriveAuth.DeviceCode = OneDriveAuth.startDeviceCode()

    /** Step 2: poll until the user logs in, then persist the refresh token. */
    suspend fun completeLogin(dc: OneDriveAuth.DeviceCode) {
        val t = OneDriveAuth.pollForTokens(dc)
        tokens = t
        store.refreshToken = t.refreshToken
    }

    /** Connection expired (reauth needed): forget the tokens so 'Opnieuw' leads back to login. */
    fun invalidate() {
        tokens = null
        store.refreshToken = null
    }

    /** Full disconnect: clears tokens + the stored folder. */
    fun clear() {
        tokens = null
        store.clear()
    }
}
