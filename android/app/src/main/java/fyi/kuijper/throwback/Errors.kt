package fyi.kuijper.throwback

import java.io.IOException

/** Vertaalt uitzonderingen naar nette, Nederlandse meldingen voor de gebruiker. */
object Errors {
    fun message(e: Throwable): String = when (e) {
        // Dekt o.a. UnknownHostException / SocketTimeoutException.
        is IOException -> "Geen internetverbinding. Controleer je wifi en probeer opnieuw."
        else -> e.message ?: "Er ging iets mis."
    }
}
