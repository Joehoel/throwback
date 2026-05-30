package fyi.kuijper.throwback

import java.io.IOException

/** Translates exceptions into clean, Dutch user-facing messages. */
object Errors {
    fun message(e: Throwable): String = when (e) {
        // Covers e.g. UnknownHostException / SocketTimeoutException.
        is IOException -> "Geen internetverbinding. Controleer je wifi en probeer opnieuw."
        else -> e.message ?: "Er ging iets mis."
    }
}
