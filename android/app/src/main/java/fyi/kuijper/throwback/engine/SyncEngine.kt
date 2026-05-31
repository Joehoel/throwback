package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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
        val indexed: Int = 0,
        val processed: Int = 0,
        val lastError: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var job: Job? = null

    /** Idempotent: starts indexing for [folderId] only if none is already running. */
    fun ensure(folderId: String) {
        if (job?.isActive == true) return
        _state.value = State(syncing = true, processed = 0)
        job = scope.launch {
            try {
                _state.value = _state.value.copy(indexed = index.count(folderId))

                if (needsFullCrawl(folderId)) {
                    var processed = 0
                    sync.crawl(folderId) { rows ->
                        index.store(folderId, rows) // geocoding runs separately, after the crawl
                        processed += rows.size
                        _state.value = _state.value.copy(processed = processed, indexed = index.count(folderId))
                    }
                    db.setMeta(reconcileKey(folderId), RECONCILE_TAG)
                    if (db.deltaLinkFor(folderId).isNullOrEmpty()) {
                        db.setDeltaLink(folderId, runCatching { sync.initDeltaToken(folderId) }.getOrNull())
                    }
                }

                index.geocodePending(folderId)

                _state.value = _state.value.copy(syncing = false, processed = 0, indexed = index.count(folderId))

                while (isActive) {
                    delay(REFRESH_INTERVAL_MS)
                    incrementalRefresh(folderId)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
            } finally {
                _state.value = _state.value.copy(syncing = false)
            }
        }
    }

    private suspend fun needsFullCrawl(folderId: String): Boolean =
        db.count(folderId) == 0 || db.getMeta(reconcileKey(folderId)) != RECONCILE_TAG

    private suspend fun incrementalRefresh(folderId: String) {
        val link = db.deltaLinkFor(folderId)?.ifBlank { null } ?: return
        _state.value = _state.value.copy(syncing = true)
        try {
            val changes = sync.refresh(link)
            index.apply(folderId, changes)
            db.setDeltaLink(folderId, changes.newDeltaLink)
            _state.value = _state.value.copy(indexed = index.count(folderId), lastError = null)
        } catch (e: Exception) {
            _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
        } finally {
            _state.value = _state.value.copy(syncing = false)
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
        const val RECONCILE_TAG = "v4-exif-place"
    }
}
