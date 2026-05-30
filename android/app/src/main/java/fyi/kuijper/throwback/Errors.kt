package fyi.kuijper.throwback

import fyi.kuijper.throwback.onedrive.OneDriveAuth
import java.io.IOException

/** Translates exceptions into clean, Dutch user-facing messages. */
object Errors {
    fun message(e: Throwable): String = when (e) {
        is OneDriveAuth.ReauthRequired ->
            "Je OneDrive-koppeling is verlopen. Kies 'Opnieuw' om weer in te loggen."
        // Covers e.g. UnknownHostException / SocketTimeoutException.
        is IOException -> "Geen internetverbinding. Controleer je wifi en probeer opnieuw."
        else -> e.message ?: "Er ging iets mis."
    }
}
