package fyi.kuijper.throwback

import android.app.Application
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid

/** Owns the process-wide [AppContainer], shared by the Activity and the screensaver. */
class ThrowbackApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        initSentry()
    }

    /**
     * Observability for the index/auth/show operations. The DSN is public (safe to commit); an empty
     * DSN would make the whole SDK a silent no-op. See docs/adr/0007.
     *
     * Privacy (the app shows private family photos): no Session Replay, no PII, and breadcrumb URLs
     * for OneDrive content / SharePoint hosts are stripped of their query string so short-lived SAS
     * tokens never leave the device.
     */
    private fun initSentry() {
        SentryAndroid.init(this) { options ->
            options.dsn = SENTRY_DSN
            options.environment = if (BuildConfig.DEBUG) "debug" else "release"
            options.release =
                "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"

            // Low-traffic family app → sample all traces; the transactions (index.crawl/delta, login)
            // are infrequent. Continuous UI profiling is intentionally off: on SDK 8.43 it streams
            // profile chunks that flood the project (HTTP 429) and log "No enum constant …ProfileUi".
            // Re-enable once that SDK issue is resolved.
            options.tracesSampleRate = 1.0
            options.logs.isEnabled = true

            options.isDebug = BuildConfig.DEBUG
            options.isSendDefaultPii = false

            options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { crumb, _ ->
                (crumb.data["url"] as? String)?.let { url ->
                    if (TOKEN_BEARING_HOSTS.any { it in url }) crumb.setData("url", url.substringBefore('?'))
                }
                crumb
            }
        }
    }

    private companion object {
        // Public DSN (safe to commit) for the "throwback" project, org de-nieuwe-psalmberijming.
        const val SENTRY_DSN =
            "https://da9522b74c61cf253f8cf577a6c74243@o4504564317749248.ingest.us.sentry.io/4511485047013376"

        // OneDrive item content (302 → SAS URL) and SharePoint/blob downloads carry a token in the query.
        val TOKEN_BEARING_HOSTS = listOf("sharepoint.com", "blob.core", "graph.microsoft.com")
    }
}
