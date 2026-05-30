package fyi.kuijper.throwback

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fyi.kuijper.throwback.engine.FolderPicker
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

    // De map-kiezer bezit de bladertoestand; laadfouten routeren we via handleError (her-inloggen e.d.).
    private val picker = FolderPicker(graph, viewModelScope, ::handleError)

    // Synchroon bepaald bij start uit SharedPreferences: gekoppeld → Booting (Loading), nooit het
    // koppelscherm. Dit haalt de flits van het koppelscherm weg die ontstond doordat de oude
    // beginwaarde NeedsConnect was terwijl de async DB-lees nog liep.
    private val navFlow = MutableStateFlow<Nav>(
        if (store.isConnected) Nav.Booting else Nav.Connect
    )

    private var connectJob: Job? = null

    val state: StateFlow<UiState> =
        combine(navFlow, slideshow.state, sync.state, settings.state, picker.state) { nav, slide, syncS, set, pick ->
            render(nav, slide, syncS, set, pick)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = render(
                navFlow.value, slideshow.state.value, sync.state.value, settings.state.value, picker.state.value,
            ),
        )

    private fun render(
        nav: Nav,
        slide: SlideshowEngine.State,
        syncS: SyncEngine.State,
        set: SettingsSnapshot,
        pick: FolderPicker.State,
    ): UiState = when (nav) {
        is Nav.Booting -> UiState.Loading
        is Nav.Connect -> UiState.NeedsConnect
        is Nav.ShowingCode -> UiState.ShowCode(nav.code)
        is Nav.PickingFolder -> UiState.PickFolder(
            pick.path, pick.folders, pick.suggestions, pick.loading, canCancel = store.hasFolder,
        )
        is Nav.Preparing -> UiState.Preparing(store.folderName ?: "Gekozen map", syncS.processed)
        is Nav.Showing -> UiState.Show(
            photo = slide.photo,
            imageUrl = slide.imageUrl,
            paused = slide.paused,
            captionEnabled = set.captionEnabled,
            syncing = syncS.syncing,
            offlineHint = slide.offlineHint,
        )
        is Nav.SettingsOpen -> UiState.Settings(
            slideSeconds = set.slideSeconds,
            shuffle = set.shuffle,
            captionEnabled = set.captionEnabled,
            indexed = syncS.indexed,
            processed = syncS.processed,
            indexing = syncS.syncing,
            syncError = syncS.lastError,
        )
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
                    val root = store.folderId
                    if (root != null) {
                        val ids = withContext(Dispatchers.IO) { db.allIds(root) }
                        slideshow.appendIds(ids)
                    }
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

    /** Open de map-kiezer bovenaan; behoudt de koppeling. */
    private fun openRootFolder() {
        navFlow.value = Nav.PickingFolder
        picker.openRoot()
    }

    /** Open de mapkiezer zonder de koppeling te wissen — "Andere map". */
    fun changeFolder() {
        slideshow.stop()
        openRootFolder()
    }

    /** Annuleren in de kiezer: terug naar de show als er al een map is. */
    fun cancelFolderPick() {
        if (store.hasFolder) resumeShow()
    }

    fun openFolder(crumb: Crumb) = picker.open(crumb)

    fun back() = picker.back()

    fun selectSuggestion(suggestion: FolderSuggestion) = onFolderChosen(Crumb(suggestion.id, suggestion.name))

    fun selectCurrentFolder() {
        picker.chooseCurrent()?.let(::onFolderChosen)
    }

    /** De gebruiker koos een Hoofdmap. Zelfde map → gewoon hervatten; anders herindexeren op die map. */
    private fun onFolderChosen(crumb: Crumb) {
        val id = crumb.id ?: return
        if (id == store.folderId) {
            resumeShow()
            return
        }
        viewModelScope.launch {
            // Index per map behouden: niets wissen. We resetten alleen de lopende show + sync zodat
            // ze de nieuwe map oppakken; bestaande index van die map wordt direct hergebruikt en met
            // delta bijgewerkt, anders een verse crawl.
            sync.cancel()
            store.folderId = id
            store.folderName = crumb.name
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
            val photos = if (folderId != null) withContext(Dispatchers.IO) { db.allPhotos(folderId) } else emptyList()
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
            val root = store.folderId ?: return@launch
            val photos = withContext(Dispatchers.IO) { db.allPhotos(root) }
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
            withContext(Dispatchers.IO) { db.clearAll() }
            session.clear()
            navFlow.value = Nav.Connect
        }
    }
}
