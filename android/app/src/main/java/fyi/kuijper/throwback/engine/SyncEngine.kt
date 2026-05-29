package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.PhotoDb
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.PlaceResolver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * De achtergrond-indexering. Bij de eerste keer (of na een schema-/logica-upgrade) een volledige
 * `children`-crawl; daarna een goedkope delta-lus die periodiek alleen wijzigingen ophaalt — zodat
 * nieuwe foto's, verwijderingen en bewerkte bijschriften vanzelf binnenkomen zónder herstart. Plaats-
 * labels worden hier (niet per weergave) gegeocodet. Fouten worden bewaard in [State.lastError]
 * i.p.v. stil geslikt; de show draait door op wat al geïndexeerd is.
 *
 * [onRemoved] meldt verwijderde foto-id's zodat de lopende afspeellijst ze kan laten vallen. Nieuwe
 * foto's komen binnen via de [state]-toggle (de coördinator vult de afspeellijst aan).
 */
class SyncEngine(
    private val db: PhotoDb,
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

    /** Start de indexering als er nog geen loopt. Idempotent. */
    fun ensure(folderId: String) {
        if (job?.isActive == true) return
        _state.value = _state.value.copy(syncing = true, processed = 0, lastError = null)
        job = scope.launch {
            try {
                if (needsFullCrawl()) {
                    sync.sync(folderId) { processed ->
                        _state.value = _state.value.copy(processed = processed, indexed = db.count())
                    }
                    withContext(Dispatchers.IO) {
                        db.setMeta(RECONCILE_KEY, RECONCILE_TAG)
                        if (db.deltaLink.isNullOrEmpty()) {
                            db.deltaLink = runCatching { sync.initDeltaToken(folderId) }.getOrNull()
                        }
                    }
                }
                _state.value = _state.value.copy(indexed = withContext(Dispatchers.IO) { db.count() }, syncing = false)
                // Eenmalige plaats-pass over alles wat nog geen label heeft.
                geocode(withContext(Dispatchers.IO) { db.photosNeedingPlace() })

                // Periodieke incrementele verversing.
                while (isActive) {
                    delay(REFRESH_INTERVAL_MS)
                    incrementalRefresh()
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
            } finally {
                _state.value = _state.value.copy(syncing = false)
            }
        }
    }

    private fun needsFullCrawl(): Boolean =
        db.count() == 0 || db.getMeta(RECONCILE_KEY) != RECONCILE_TAG

    private suspend fun incrementalRefresh() {
        _state.value = _state.value.copy(syncing = true)
        try {
            val changes = sync.refresh()
            if (changes.deletedIds.isNotEmpty()) {
                withContext(Dispatchers.IO) { db.deleteIds(changes.deletedIds) }
                onRemoved(changes.deletedIds)
            }
            if (changes.upserts.isNotEmpty()) {
                withContext(Dispatchers.IO) { db.upsertAll(changes.upserts) }
                geocode(changes.upserts)
            }
            _state.value = _state.value.copy(indexed = withContext(Dispatchers.IO) { db.count() }, lastError = null)
        } catch (e: Exception) {
            // Best effort: laat de fout zien maar blijf de lus draaien (volgende ronde kan weer slagen).
            _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
        } finally {
            _state.value = _state.value.copy(syncing = false)
        }
    }

    /** Reverse-geocode de foto's met GPS en schrijf het plaats-label terug in de index. */
    private suspend fun geocode(rows: List<PhotoRow>) = withContext(Dispatchers.IO) {
        for (p in rows) {
            if (p.lat == null || p.lon == null || p.place != null) continue
            placeResolver.resolve(p.lat, p.lon)?.let { db.updatePlace(p.id, it) }
        }
    }

    fun cancel() {
        job?.cancel()
    }

    fun reset() {
        job?.cancel()
        _state.value = State()
    }

    private companion object {
        const val REFRESH_INTERVAL_MS = 10 * 60 * 1000L
        const val RECONCILE_KEY = "reconcile_tag"
        // Verhoog deze waarde om bij de volgende start één volledige her-crawl af te dwingen
        // (bv. na een wijziging in hoe we metadata uitlezen). v3: ingebedde EXIF-bijschriften.
        const val RECONCILE_TAG = "v3-exif-place"
    }
}
