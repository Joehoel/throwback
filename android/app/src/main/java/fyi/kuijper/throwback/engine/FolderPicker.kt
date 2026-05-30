package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.Crumb
import fyi.kuijper.throwback.FolderSuggestion
import fyi.kuijper.throwback.onedrive.DriveItem
import fyi.kuijper.throwback.onedrive.GraphClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.coroutines.cancellation.CancellationException

/**
 * Lets the user browse the OneDrive folder tree and pick the root folder the app will follow. Owns
 * only the browse state (path + subfolders + suggestions) and knows only [GraphClient] — nothing of
 * the TokenStore, the engines or navigation. What a choice means (same folder → resume, other folder
 * → reindex) is decided by the coordinator ([MainViewModel]); the picker only yields the chosen [Crumb].
 *
 * Intents are synchronous (set `loading` immediately, so no flicker frame); fetching runs on [scope].
 * Load errors go to [onError] so the coordinator can route them (e.g. re-login).
 */
class FolderPicker(
    private val graph: GraphClient,
    private val scope: CoroutineScope,
    private val onError: (Throwable) -> Unit,
) {
    data class State(
        val path: List<Crumb> = emptyList(),
        val folders: List<DriveItem> = emptyList(),
        val suggestions: List<FolderSuggestion> = emptyList(),
        val loading: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var loadJob: Job? = null

    /** Start at the OneDrive root (id null is not selectable, only browsable). */
    fun openRoot() = load(listOf(Crumb(null, "OneDrive")))

    fun open(crumb: Crumb) = load(_state.value.path + crumb)

    /** One level up; no-op at the root. */
    fun back() {
        val path = _state.value.path
        if (path.size > 1) load(path.dropLast(1))
    }

    /** The folder the user is currently in, if selectable (not the root); else null. */
    fun chooseCurrent(): Crumb? = _state.value.path.lastOrNull()?.takeIf { it.id != null }

    private fun load(path: List<Crumb>) {
        _state.value = State(path = path, loading = true) // synchronous: 'loading' at once, no flicker
        loadJob?.cancel()
        loadJob = scope.launch {
            try {
                val folders = graph.listFolders(path.last().id)
                // Only show suggested photo folders at the top, not deep in the tree.
                val suggestions = if (path.size == 1) detectSuggestions() else emptyList()
                _state.value = State(path, folders, suggestions, loading = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onError(e)
            }
        }
    }

    private suspend fun detectSuggestions(): List<FolderSuggestion> {
        val found = LinkedHashMap<String, FolderSuggestion>()
        graph.specialFolder("cameraroll")?.let {
            found[it.id] = FolderSuggestion(it.id, "Camera-album", it.childCount)
        }
        graph.specialFolder("photos")?.let {
            found.putIfAbsent(it.id, FolderSuggestion(it.id, "Foto's", it.childCount))
        }
        return found.values.toList()
    }
}
