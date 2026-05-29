package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.PhotoDb
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * De achtergrond-indexering: crawlt de gekozen map en werkt de lokale index bij, met de
 * voortgang als [StateFlow]. Stil falen is bewust — bij een netwerk-/koppelingsfout tonen we
 * gewoon wat al geïndexeerd is; de coördinator reageert op de [State] (start de show zodra de
 * eerste foto's binnen zijn, vult de lopende show daarna aan).
 */
class SyncEngine(
    private val db: PhotoDb,
    private val sync: GraphSync,
    private val scope: CoroutineScope,
) {
    data class State(
        val syncing: Boolean = false,
        val indexed: Int = 0,
        val processed: Int = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var job: Job? = null

    /** Start een crawl als er nog geen loopt. Idempotent. */
    fun ensure(folderId: String) {
        if (job?.isActive == true) return
        _state.value = _state.value.copy(syncing = true, processed = 0)
        job = scope.launch {
            try {
                sync.sync(folderId) { processed ->
                    // Callback draait op de IO-dispatcher (binnen sync.sync) → db-calls zijn veilig.
                    _state.value = _state.value.copy(processed = processed, indexed = db.count())
                }
                val total = withContext(Dispatchers.IO) { db.count() }
                _state.value = _state.value.copy(indexed = total)
            } catch (_: Exception) {
                // Stil falen: de show draait door op wat er al is (de offline-hint komt uit de
                // slideshow-engine zodra de eerstvolgende thumbnail-fetch ook faalt).
            } finally {
                _state.value = _state.value.copy(syncing = false)
            }
        }
    }

    fun cancel() {
        job?.cancel()
    }

    fun reset() {
        job?.cancel()
        _state.value = State()
    }
}
