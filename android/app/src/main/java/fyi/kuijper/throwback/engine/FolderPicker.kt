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
 * De map-kiezer: laat de gebruiker door de OneDrive-mappenboom bladeren en de **Hoofdmap** kiezen die
 * de app voortaan volgt. Bezit alleen de bladertoestand (pad + submappen + voorstellen) en kent enkel
 * [GraphClient] — niets van de [TokenStore], de engines of de navigatie. Wát een keuze betekent
 * (zelfde map → hervatten, andere map → herindexeren) beslist de coördinator ([MainViewModel]); de
 * kiezer levert alleen de gekozen [Crumb].
 *
 * Intents zijn synchroon (zetten meteen `loading`, dus geen flikkerframe); het ophalen draait op
 * [scope]. Laadfouten gaan naar [onError] zodat de coördinator ze kan routeren (bv. her-inloggen).
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

    /** Begin bovenaan: de OneDrive-root (id null is niet kiesbaar, alleen om in te bladeren). */
    fun openRoot() = load(listOf(Crumb(null, "OneDrive")))

    /** Daal af in [crumb] (een submap van het huidige pad). */
    fun open(crumb: Crumb) = load(_state.value.path + crumb)

    /** Eén niveau omhoog; op de root doet dit niets. */
    fun back() {
        val path = _state.value.path
        if (path.size > 1) load(path.dropLast(1))
    }

    /** De map waar de gebruiker nu in staat, als die kiesbaar is (niet de root); anders null. */
    fun chooseCurrent(): Crumb? = _state.value.path.lastOrNull()?.takeIf { it.id != null }

    private fun load(path: List<Crumb>) {
        _state.value = State(path = path, loading = true) // synchroon: meteen 'laden', geen flikker
        loadJob?.cancel()
        loadJob = scope.launch {
            try {
                val folders = graph.listFolders(path.last().id)
                // Voorgestelde fotomappen alleen bovenaan tonen, niet diep in de boom.
                val suggestions = if (path.size == 1) detectSuggestions() else emptyList()
                _state.value = State(path, folders, suggestions, loading = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onError(e)
            }
        }
    }

    /** Probeert de bekende fotomappen (camera-album / foto's) te vinden; ontbrekende → overslaan. */
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
