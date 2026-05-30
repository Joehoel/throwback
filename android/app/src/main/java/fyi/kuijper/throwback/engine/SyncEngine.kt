package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GeoCluster
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.PlaceResolver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * Per-folder background indexing. First run (or after a logic upgrade) does a full `children` crawl;
 * thereafter a cheap delta loop periodically fetches only changes. Each folder keeps its own index,
 * delta token and reconcile flag, so switching folders discards nothing.
 *
 * Geocoding is decoupled from the crawl: the crawl only writes rows (so playback can start at once),
 * and reverse-geocoding then runs as a separate parallel pass off the crawl critical path, filling in
 * place labels while the show is already running. Errors surface in [State.lastError] instead of being
 * swallowed; the show keeps running on whatever is already indexed.
 */
class SyncEngine(
    private val db: PhotoDao,
    private val sync: GraphSync,
    private val placeResolver: PlaceResolver,
    private val scope: CoroutineScope,
    private val onRemoved: (List<String>) -> Unit = {},
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
                _state.value = _state.value.copy(indexed = db.count(folderId))

                if (needsFullCrawl(folderId)) {
                    var processed = 0
                    sync.crawl(folderId) { rows ->
                        db.upsertAll(folderId, rows) // geocoding runs separately, after the crawl
                        processed += rows.size
                        _state.value = _state.value.copy(processed = processed, indexed = db.count(folderId))
                    }
                    db.setMeta(reconcileKey(folderId), RECONCILE_TAG)
                    if (db.deltaLinkFor(folderId).isNullOrEmpty()) {
                        db.setDeltaLink(folderId, runCatching { sync.initDeltaToken(folderId) }.getOrNull())
                    }
                }

                geocode(db.photosNeedingPlace(folderId))

                _state.value = _state.value.copy(syncing = false, processed = 0, indexed = db.count(folderId))

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
            if (changes.deletedIds.isNotEmpty()) {
                db.deleteIds(changes.deletedIds)
                onRemoved(changes.deletedIds)
            }
            if (changes.upserts.isNotEmpty()) {
                db.upsertAll(folderId, changes.upserts)
                geocode(changes.upserts)
            }
            db.setDeltaLink(folderId, changes.newDeltaLink)
            _state.value = _state.value.copy(indexed = db.count(folderId), lastError = null)
        } catch (e: Exception) {
            _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
        } finally {
            _state.value = _state.value.copy(syncing = false)
        }
    }

    /**
     * Reverse-geocode photos with GPS and write back the place label. Clustered by event + coarse cell
     * ([GeoCluster]): one lookup per cluster, label applied to all members. Clusters run in parallel
     * ([MAX_CONCURRENT_GEOCODES] at a time). A failed lookup leaves its cluster untouched for the next pass.
     */
    private suspend fun geocode(rows: List<PhotoRow>) {
        val located = rows.filter { it.lat != null && it.lon != null && it.place == null }
        if (located.isEmpty()) return
        val clusters = located.groupBy { GeoCluster.keyOf(it.event, it.lat!!, it.lon!!) }
        coroutineScope {
            val gate = Semaphore(MAX_CONCURRENT_GEOCODES)
            clusters.values.map { members ->
                async {
                    if (!currentCoroutineContext().isActive) return@async
                    gate.withPermit {
                        val rep = members.first()
                        val label = placeResolver.resolve(rep.lat!!, rep.lon!!) ?: return@withPermit
                        db.updatePlaces(members.associate { it.id to label })
                    }
                }
            }.awaitAll()
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
        const val MAX_CONCURRENT_GEOCODES = 6
        // Bump to force one full re-crawl per folder on next start.
        const val RECONCILE_TAG = "v4-exif-place"
    }
}
