package fyi.kuijper.throwback

import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.protocol.User
import kotlinx.coroutines.CancellationException

/**
 * One funnel for the app's Sentry calls, so the engine/onedrive modules depend on a single internal
 * symbol instead of the raw SDK. Every call here is a no-op when no DSN is configured (Sentry stays
 * uninitialised), so unit tests and DSN-less builds need no special handling.
 */
object Telemetry {

    /**
     * Report a failure the app *handled* — the Fotoshow keeps running on whatever is already indexed,
     * so these are otherwise swallowed into a UI string ([SyncEngine.State.lastError]) and never seen.
     * [op] groups them in Sentry (e.g. "index.crawl", "slideshow.thumbnail"). Coroutine cancellation
     * (a folder switch / retry) is normal control flow, not an error, so it's skipped.
     */
    fun captureHandled(e: Throwable, op: String, level: SentryLevel = SentryLevel.WARNING) {
        if (e is CancellationException) return
        Sentry.withScope { scope ->
            scope.level = level
            scope.setTag("op", op)
            Sentry.captureException(e)
        }
    }

    /** A navigation / lifecycle marker that gives a later failure its surrounding context. */
    fun breadcrumb(message: String, category: String = "app") {
        Sentry.addBreadcrumb(message, category)
    }

    /**
     * Attach the connected OneDrive account to events as a stable, non-PII id — the drive owner's
     * Graph id only, no name or email (keeps the isSendDefaultPii=false stance from docs/adr/0007).
     * Replaces the anonymous installationId so errors say *which* box they came from, not who.
     */
    fun setUser(ownerId: String) {
        Sentry.setUser(User().apply { id = ownerId })
    }

    /** Forget the account on disconnect so later events aren't misattributed to the previous user. */
    fun clearUser() {
        Sentry.setUser(null)
    }
}
