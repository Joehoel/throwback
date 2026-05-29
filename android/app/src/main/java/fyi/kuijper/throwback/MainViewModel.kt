package fyi.kuijper.throwback

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fyi.kuijper.throwback.engine.SlideshowEngine
import fyi.kuijper.throwback.engine.SyncEngine
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Coördinator: bezit alleen de navigatie-flow ([Nav]) en leidt daaruit — gecombineerd met de
 * gedeelde engines (slideshow/sync/settings) — de [UiState] af. De doorlopende state (afspeellijst,
 * sync-voortgang, instellingen) leeft in de engines uit [AppContainer], niet hier. Zo zit alle
 * mutable state bij de eigenaar ervan en hoeft niets handmatig gesynchroniseerd te worden.
 */
class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val container = (app as ThrowbackApp).container
    private val store = container.store
    private val session = container.session
    private val db = container.db
    private val graph = container.graph
    private val settings = container.settings
    private val slideshow: SlideshowEngine = container.slideshow
    private val sync: SyncEngine = container.sync

    // Synchroon bepaald bij start uit SharedPreferences: gekoppeld → Booting (Loading), nooit het
    // koppelscherm. Dit haalt de flits van het koppelscherm weg die ontstond doordat de oude
    // beginwaarde NeedsConnect was terwijl de async DB-lees nog liep.
    private val navFlow = MutableStateFlow<Nav>(
        if (store.isConnected) Nav.Booting else Nav.Connect
    )

    private var connectJob: Job? = null

    val state: StateFlow<UiState> =
        combine(navFlow, slideshow.state, sync.state, settings.state) { nav, slide, syncS, set ->
            render(nav, slide, syncS, set)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = render(navFlow.value, slideshow.state.value, sync.state.value, settings.state.value),
        )

    private fun render(
        nav: Nav,
        slide: SlideshowEngine.State,
        syncS: SyncEngine.State,
        set: SettingsSnapshot,
    ): UiState = when (nav) {
        is Nav.Booting -> UiState.Loading
        is Nav.Connect -> UiState.NeedsConnect
        is Nav.ShowingCode -> UiState.ShowCode(nav.code)
        is Nav.PickingFolder -> UiState.PickFolder(nav.path, nav.folders, nav.suggestions, nav.loading, nav.canCancel)
        is Nav.Preparing -> UiState.Preparing(store.folderName ?: "Gekozen map", syncS.processed)
        is Nav.Showing -> UiState.Show(
            photo = slide.photo,
            imageUrl = slide.imageUrl,
            paused = slide.paused,
            captionEnabled = set.captionEnabled,
            syncing = syncS.syncing,
            offlineHint = slide.offlineHint,
        )
        is Nav.SettingsOpen -> UiState.Settings(set.slideSeconds, set.shuffle, set.captionEnabled)
        is Nav.Failed -> UiState.Error(nav.message)
    }

    init {
        // Reageer op de achtergrond-sync: start de show zodra de eerste foto's binnen zijn,
        // en vul de lopende show aan zodra een crawl klaar is.
        viewModelScope.launch {
            var wasSyncing = false
            sync.state.collect { s ->
                if (navFlow.value is Nav.Preparing && s.indexed > 0) startShowFromIndex()
                if (wasSyncing && !s.syncing && slideshow.hasPlaylist) {
                    val ids = withContext(Dispatchers.IO) { db.allIds() }
                    slideshow.appendIds(ids)
                }
                wasSyncing = s.syncing
            }
        }

        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openRootFolder()
            else -> {} // navFlow staat al op Connect
        }
    }

    // --- Koppelen ---

    fun connect() {
        connectJob?.cancel()
        connectJob = viewModelScope.launch {
            try {
                val dc = session.startDeviceCode()
                navFlow.value = Nav.ShowingCode(dc)
                session.completeLogin(dc)
                if (store.hasFolder) startShow() else openRootFolder()
            } catch (e: Exception) {
                navFlow.value = Nav.Failed(Errors.message(e))
            }
        }
    }

    // --- Mapkeuze (behoudt altijd de koppeling) ---

    private fun openRootFolder() = openFolder(Crumb(null, "OneDrive"), reset = true)

    /** Open de mapkiezer zonder de koppeling te wissen — "Andere map". */
    fun changeFolder() {
        slideshow.stop()
        openRootFolder()
    }

    /** Annuleren in de kiezer: terug naar de show als er al een map is. */
    fun cancelFolderPick() {
        if (store.hasFolder) resumeShow()
    }

    fun openFolder(crumb: Crumb, reset: Boolean = false) {
        val current = navFlow.value
        val path = when {
            reset -> listOf(crumb)
            current is Nav.PickingFolder -> current.path + crumb
            else -> listOf(crumb)
        }
        loadFolder(path)
    }

    fun back() {
        val current = navFlow.value as? Nav.PickingFolder ?: return
        if (current.path.size <= 1) return
        loadFolder(current.path.dropLast(1))
    }

    private fun loadFolder(path: List<Crumb>) {
        navFlow.value = Nav.PickingFolder(path, emptyList(), emptyList(), loading = true, canCancel = store.hasFolder)
        viewModelScope.launch {
            try {
                val folders = graph.listFolders(path.last().id)
                val suggestions = if (path.size == 1) detectSuggestions() else emptyList()
                navFlow.value = Nav.PickingFolder(path, folders, suggestions, loading = false, canCancel = store.hasFolder)
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /** Probeert de bekende foto-mappen te vinden; ontbrekende → gewoon overslaan. */
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

    fun selectSuggestion(suggestion: FolderSuggestion) = selectFolder(suggestion.id, suggestion.name)

    fun selectCurrentFolder() {
        val current = navFlow.value as? Nav.PickingFolder ?: return
        val crumb = current.path.last()
        val id = crumb.id ?: run {
            navFlow.value = Nav.Failed("Kies een submap, niet de hele OneDrive-root.")
            return
        }
        selectFolder(id, crumb.name)
    }

    private fun selectFolder(id: String, name: String) {
        // Dezelfde map opnieuw kiezen: gewoon terug naar de show, niets opnieuw indexeren.
        if (id == store.folderId) {
            resumeShow()
            return
        }
        viewModelScope.launch {
            sync.cancel()
            store.folderId = id
            store.folderName = name
            withContext(Dispatchers.IO) { db.clearIndex() }
            slideshow.reset()
            sync.reset()
            startShow()
        }
    }

    // --- Slideshow ---

    fun startShow() {
        viewModelScope.launch {
            val folderId = store.folderId
            if (slideshow.hasPlaylist) {
                slideshow.resume()
                navFlow.value = Nav.Showing
                if (folderId != null) sync.ensure(folderId)
                return@launch
            }
            val photos = withContext(Dispatchers.IO) { db.allPhotos() }
            if (photos.isEmpty()) {
                navFlow.value = Nav.Preparing
                if (folderId != null) sync.ensure(folderId)
                return@launch
            }
            slideshow.start(photos, settings.shuffle)
            navFlow.value = Nav.Showing
            if (folderId != null) sync.ensure(folderId) // achtergrond-verversing voor nieuwe foto's
        }
    }

    /** De achtergrond-sync meldde de eerste foto's terwijl we voorbereidden → start de show. */
    private fun startShowFromIndex() {
        viewModelScope.launch {
            if (navFlow.value !is Nav.Preparing) return@launch
            if (slideshow.hasPlaylist) {
                navFlow.value = Nav.Showing
                return@launch
            }
            val photos = withContext(Dispatchers.IO) { db.allPhotos() }
            if (photos.isEmpty()) return@launch
            slideshow.start(photos, settings.shuffle)
            navFlow.value = Nav.Showing
        }
    }

    /** Hervat de bestaande show (na instellingen / annuleren), of start vers als er nog niets is. */
    private fun resumeShow() {
        if (slideshow.hasPlaylist) {
            slideshow.resume()
            navFlow.value = Nav.Showing
        } else {
            startShow()
        }
    }

    fun nextPhoto() = slideshow.next()
    fun previousPhoto() = slideshow.previous()
    fun togglePause() = slideshow.togglePause()

    // --- Instellingen ---

    fun openSettings() {
        slideshow.stop() // pauzeer de lus zodat hij niet doortelt terwijl we in de instellingen zitten
        navFlow.value = Nav.SettingsOpen
    }

    // Schrijven naar [settings] werkt settings.state bij → de gecombineerde UiState volgt vanzelf.
    fun setSlideSeconds(seconds: Int) { settings.slideSeconds = seconds }
    fun setShuffle(shuffle: Boolean) { settings.shuffle = shuffle }
    fun setCaptionEnabled(enabled: Boolean) { settings.captionEnabled = enabled }

    fun closeSettings() = resumeShow()

    // --- Fouten & koppeling ---

    /** Centrale foutafhandeling: verlopen koppeling → opnieuw inloggen; anders nette melding. */
    private fun handleError(e: Throwable) {
        if (e is OneDriveAuth.ReauthRequired) {
            session.invalidate() // forceert NeedsConnect bij 'Opnieuw'
            connectJob?.cancel()
            slideshow.stop()
            sync.cancel()
            navFlow.value = Nav.Failed("Je OneDrive-koppeling is verlopen. Kies 'Opnieuw' om weer in te loggen.")
        } else {
            navFlow.value = Nav.Failed(Errors.message(e))
        }
    }

    fun retry() {
        connectJob?.cancel()
        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openRootFolder()
            else -> navFlow.value = Nav.Connect
        }
    }

    /** Loskoppelen: wist token + map en gaat terug naar het koppelscherm (alleen vanuit Instellingen). */
    fun disconnect() {
        connectJob?.cancel()
        slideshow.reset()
        sync.reset()
        viewModelScope.launch {
            withContext(Dispatchers.IO) { db.clearIndex() }
            session.clear()
            navFlow.value = Nav.Connect
        }
    }
}
