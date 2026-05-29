package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Eigenaar van de OneDrive-koppeling: token-cache, automatisch verversen, device-code-login en
 * loskoppelen. De refresh-token wordt persistent bewaard in [TokenStore]; het access-token leeft
 * alleen in het geheugen. De [Mutex] voorkomt dat slideshow- en sync-engine tegelijk verversen
 * (ze delen nu één sessie). De map-keuze blijft eigendom van [TokenStore] zelf (zie [store]).
 */
class Session(val store: TokenStore) {

    @Volatile
    private var tokens: OneDriveAuth.Tokens? = null
    private val refreshLock = Mutex()

    val isConnected: Boolean get() = store.isConnected
    val hasFolder: Boolean get() = store.hasFolder

    /** Een geldig access-token, zo nodig (thread-safe) ververst. Gooit [OneDriveAuth.ReauthRequired]. */
    suspend fun accessToken(): String {
        tokens?.let { if (it.expiresAtMillis > System.currentTimeMillis()) return it.accessToken }
        return refreshLock.withLock {
            // Dubbel-check: een andere coroutine kan net ververst hebben terwijl we wachtten.
            tokens?.let { if (it.expiresAtMillis > System.currentTimeMillis()) return it.accessToken }
            val rt = store.refreshToken ?: error("Niet gekoppeld")
            val fresh = OneDriveAuth.refresh(rt)
            tokens = fresh
            fresh.refreshToken?.let { store.refreshToken = it }
            fresh.accessToken
        }
    }

    /** Stap 1 van de device-code-login. */
    suspend fun startDeviceCode(): OneDriveAuth.DeviceCode = OneDriveAuth.startDeviceCode()

    /** Stap 2: poll tot de gebruiker inlogt, bewaar daarna de refresh-token. */
    suspend fun completeLogin(dc: OneDriveAuth.DeviceCode) {
        val t = OneDriveAuth.pollForTokens(dc)
        tokens = t
        store.refreshToken = t.refreshToken
    }

    /** Koppeling is verlopen (reauth nodig): vergeet de tokens zodat 'Opnieuw' weer naar login leidt. */
    fun invalidate() {
        tokens = null
        store.refreshToken = null
    }

    /** Volledig loskoppelen: tokens + opgeslagen map wissen. */
    fun clear() {
        tokens = null
        store.clear()
    }
}
