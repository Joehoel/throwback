package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.Telemetry
import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphSync
import io.sentry.Sentry
import io.sentry.SpanStatus
import io.sentry.TransactionOptions
import io.sentry.kotlin.SentryContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Per-folder background indexing — the *scheduler*. First run (or after a logic upgrade) does a full
 * `children` crawl; thereafter a cheap delta loop periodically fetches only changes. Each folder keeps
 * its own index, delta token and reconcile flag, so switching folders discards nothing.
 *
 * It decides *when* to crawl vs. refresh and tracks progress in [State]; the actual writing of rows
 * (persist + reveal in the show + geocode) is delegated to [IndexUpdater]. Geocoding stays off the
 * crawl critical path: the crawl streams rows in, then geocodes once at the end, so playback can start
 * before any place labels exist (ADR-0004). Errors surface in [State.lastError]; the show keeps
 * running on whatever is already indexed.
 */
class SyncEngine(
    private val db: PhotoDao,
    private val sync: GraphSync,
    private val index: IndexUpdater,
    private val scope: CoroutineScope,
) {
    data class State(
        val syncing: Boolean = false,
        val indexed: Int = 0,       // photos in the local index (the "X geïndexeerd" count when idle)
        val processed: Int = 0,     // photos handled *this run* — the indexing progress numerator; 0 when idle
        val total: Int = 0,         // photos in the folder — the progress denominator (re-crawl knows it up front)
        val located: Int = 0,       // photos with GPS (the geocoding denominator)
        val geocoded: Int = 0,      // photos given a place label
        val lastError: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var job: Job? = null

    /** Idempotent: starts indexing for [folderId] only if none is already running. */
    fun ensure(folderId: String) {
        if (job?.isActive == true) return
        _state.value = State(syncing = true)
        job = scope.launch {
            try {
                indexFolder(folderId)
                while (isActive) {
                    delay(REFRESH_INTERVAL_MS)
                    incrementalRefresh(folderId)
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Telemetry.captureHandled(e, "index.crawl")
                _state.update { it.copy(lastError = e.message ?: e.javaClass.simpleName) }
            } finally {
                _state.update { it.copy(syncing = false) }
            }
        }
    }

    /**
     * Initial index of [folderId]: a full crawl (first run / after a logic bump) plus a geocoding
     * pass, as one Sentry transaction with child spans. The periodic refresh loop runs after this and
     * records its own per-tick transactions. Errors propagate to [ensure]'s handler (capture + UI).
     */
    private suspend fun indexFolder(folderId: String) {
        val tx = Sentry.startTransaction(
            "Index folder", "index.crawl",
            TransactionOptions().apply { isBindToScope = true },
        )
        try {
            val fullCrawl = needsFullCrawl(folderId)
            val existing = index.count(folderId)
            coroutineScope {
                // True denominator for a *first* index of an empty folder: count the tree (listing only,
                // no EXIF fetches) alongside the crawl, so the total lands before the slower enriching
                // crawl catches up. Skipped on a re-crawl — there the index is already full, so `existing`
                // is the total up front, and the count pass would only add Graph load competing with the
                // running show's thumbnail fetches.
                if (fullCrawl && existing == 0) launch(SentryContext()) {
                    runCatching { sync.countMedia(folderId) }.getOrNull()?.let { t ->
                        _state.update { it.copy(total = maxOf(it.total, t)) }
                    }
                }
                withContext(SentryContext()) {
                    _state.update { it.copy(indexed = existing, total = maxOf(it.total, existing), located = index.located(folderId)) }

                    if (fullCrawl) {
                        val span = tx.startChild("crawl.fetch", "Crawl OneDrive children")
                        var processed = 0
                        sync.crawl(folderId) { rows ->
                            index.store(folderId, rows) // geocoding runs separately, after the crawl
                            processed += rows.size
                            val indexed = index.count(folderId)
                            _state.update {
                                it.copy(
                                    processed = processed,
                                    indexed = indexed,
                                    total = maxOf(it.total, indexed),
                                    located = index.located(folderId),
                                )
                            }
                        }
                        span.finish()
                        db.setMeta(reconcileKey(folderId), RECONCILE_TAG)
                        if (db.deltaLinkFor(folderId).isNullOrEmpty()) {
                            db.setDeltaLink(folderId, runCatching { sync.initDeltaToken(folderId) }.getOrNull())
                        }
                    }

                    val geo = tx.startChild("geocode", "Reverse-geocode new photos")
                    index.geocodePending(folderId)
                    geo.finish()

                    val indexed = index.count(folderId)
                    _state.update {
                        it.copy(
                            syncing = false,
                            processed = 0, // back to idle → the UI shows "X foto's geïndexeerd"
                            indexed = indexed,
                            total = maxOf(it.total, indexed),
                            located = index.located(folderId),
                            geocoded = index.geocoded(folderId),
                        )
                    }
                }
            }
            tx.status = SpanStatus.OK
        } catch (e: Throwable) {
            if (e !is CancellationException) {
                tx.throwable = e
                tx.status = SpanStatus.INTERNAL_ERROR
            }
            throw e
        } finally {
            tx.finish()
        }
    }

    private suspend fun needsFullCrawl(folderId: String): Boolean =
        db.count(folderId) == 0 || db.getMeta(reconcileKey(folderId)) != RECONCILE_TAG

    private suspend fun incrementalRefresh(folderId: String) {
        val link = db.deltaLinkFor(folderId)?.ifBlank { null } ?: return
        _state.update { it.copy(syncing = true) }
        val tx = Sentry.startTransaction(
            "Delta refresh", "index.delta",
            TransactionOptions().apply { isBindToScope = true },
        )
        try {
            withContext(SentryContext()) {
                val changes = sync.refresh(link)
                index.apply(folderId, changes)
                db.setDeltaLink(folderId, changes.newDeltaLink)
                // Fully indexed here, so total == indexed and there's no per-run progress to show.
                val count = index.count(folderId)
                _state.update {
                    it.copy(
                        indexed = count, processed = 0, total = count,
                        located = index.located(folderId), geocoded = index.geocoded(folderId),
                        lastError = null,
                    )
                }
            }
            tx.status = SpanStatus.OK
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            tx.throwable = e
            tx.status = SpanStatus.INTERNAL_ERROR
            Telemetry.captureHandled(e, "index.delta")
            _state.update { it.copy(lastError = e.message ?: e.javaClass.simpleName) }
        } finally {
            tx.finish()
            _state.update { it.copy(syncing = false) }
        }
    }

    fun cancel() {
        job?.cancel()
    }

    fun reset() {
        job?.cancel()
        _state.value = State()
    }

    private fun reconcileKey(folderId: String) = "reconcile:$folderId"

    private companion object {
        const val REFRESH_INTERVAL_MS = 10 * 60 * 1000L
        // Bump to force one full re-crawl per folder on next start.
        const val RECONCILE_TAG = "v6-exif-bytes-utf8"
    }
}
