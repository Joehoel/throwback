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
 * De achtergrond-indexering, **per gekozen map**. Bij de eerste keer (of na een logica-upgrade) een
 * volledige `children`-crawl; daarna een goedkope delta-lus die periodiek alleen wijzigingen ophaalt.
 * Elke map houdt z'n eigen index, delta-token en reconcile-vlag, zodat wisselen niets weggooit.
 *
 * Voortgang ([State.processed] / [State.indexed]): een foto telt pas mee in `processed` nadat 'm
 * verwerkt is — inclusief de geocode-stap — ongeacht of er een locatie uitkwam. Fouten staan in
 * [State.lastError] i.p.v. stil geslikt; de show draait door op wat al geïndexeerd is.
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

    /** Start de indexering voor [folderId] als er nog geen loopt. Idempotent. */
    fun ensure(folderId: String) {
        if (job?.isActive == true) return
        _state.value = State(syncing = true, processed = 0)
        job = scope.launch {
            try {
                withContext(Dispatchers.IO) { db.claimUnassigned(folderId) }
                _state.value = _state.value.copy(indexed = withContext(Dispatchers.IO) { db.count(folderId) })

                if (needsFullCrawl(folderId)) {
                    var processed = 0
                    sync.crawl(folderId) { rows ->
                        withContext(Dispatchers.IO) { db.upsertAll(folderId, rows) }
                        geocode(rows) // locatie optioneel; we tellen pas ná deze stap
                        processed += rows.size
                        _state.value = _state.value.copy(
                            processed = processed,
                            indexed = withContext(Dispatchers.IO) { db.count(folderId) },
                        )
                    }
                    withContext(Dispatchers.IO) {
                        db.setMeta(reconcileKey(folderId), RECONCILE_TAG)
                        if (db.deltaLinkFor(folderId).isNullOrEmpty()) {
                            db.setDeltaLink(folderId, runCatching { sync.initDeltaToken(folderId) }.getOrNull())
                        }
                    }
                }

                // Vang foto's op die nog geen plaats hebben (geocode-fout tijdens de crawl, of een
                // map die al geïndexeerd was maar het geocoden niet afmaakte).
                geocode(withContext(Dispatchers.IO) { db.photosNeedingPlace(folderId) })

                _state.value = _state.value.copy(
                    syncing = false,
                    processed = 0,
                    indexed = withContext(Dispatchers.IO) { db.count(folderId) },
                )

                // Periodieke incrementele verversing.
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

    private suspend fun needsFullCrawl(folderId: String): Boolean = withContext(Dispatchers.IO) {
        db.count(folderId) == 0 || db.getMeta(reconcileKey(folderId)) != RECONCILE_TAG
    }

    private suspend fun incrementalRefresh(folderId: String) {
        val link = withContext(Dispatchers.IO) { db.deltaLinkFor(folderId) }?.ifBlank { null } ?: return
        _state.value = _state.value.copy(syncing = true)
        try {
            val changes = sync.refresh(link)
            if (changes.deletedIds.isNotEmpty()) {
                withContext(Dispatchers.IO) { db.deleteIds(changes.deletedIds) }
                onRemoved(changes.deletedIds)
            }
            if (changes.upserts.isNotEmpty()) {
                withContext(Dispatchers.IO) { db.upsertAll(folderId, changes.upserts) }
                geocode(changes.upserts)
            }
            withContext(Dispatchers.IO) { db.setDeltaLink(folderId, changes.newDeltaLink) }
            _state.value = _state.value.copy(indexed = withContext(Dispatchers.IO) { db.count(folderId) }, lastError = null)
        } catch (e: Exception) {
            _state.value = _state.value.copy(lastError = e.message ?: e.javaClass.simpleName)
        } finally {
            _state.value = _state.value.copy(syncing = false)
        }
    }

    /**
     * Reverse-geocode de foto's met GPS en schrijf het plaats-label terug. We pacen alleen echte
     * opzoekingen (cache-missers); gedeelde locaties komen uit de cache en gaan direct. Foto's zonder
     * GPS worden overgeslagen (geen locatie), maar tellen verder gewoon als verwerkt.
     */
    private suspend fun geocode(rows: List<PhotoRow>) = withContext(Dispatchers.IO) {
        for (p in rows) {
            if (!isActive) break
            if (p.lat == null || p.lon == null || p.place != null) continue
            val fresh = !placeResolver.isCached(p.lat, p.lon)
            placeResolver.resolve(p.lat, p.lon)?.let { db.updatePlace(p.id, it) }
            if (fresh) delay(GEOCODE_PACE_MS)
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
        const val GEOCODE_PACE_MS = 80L
        // Verhoog om bij de volgende start één volledige her-crawl per map af te dwingen.
        const val RECONCILE_TAG = "v4-exif-place"
    }
}
