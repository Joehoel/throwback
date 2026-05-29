package fyi.kuijper.throwback

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import androidx.lifecycle.viewModelScope
import fyi.kuijper.throwback.onedrive.DriveItem
import fyi.kuijper.throwback.onedrive.GraphClient
import fyi.kuijper.throwback.onedrive.GraphMedia
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import fyi.kuijper.throwback.onedrive.PhotoDb
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.TokenStore
import fyi.kuijper.throwback.player.PhotoOrder
import fyi.kuijper.throwback.player.Playlist
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

/** Eén map in het navigatiepad van de kiezer (root = id null). */
data class Crumb(val id: String?, val name: String)

/** Een automatisch gevonden fotomap (camera-album / foto's) die we bovenaan aanbieden. */
data class FolderSuggestion(val id: String, val name: String, val childCount: Int)

sealed interface UiState {
    data object NeedsConnect : UiState
    data class ShowCode(val code: OneDriveAuth.DeviceCode) : UiState
    data class PickFolder(
        val path: List<Crumb>,
        val folders: List<DriveItem>,
        val suggestions: List<FolderSuggestion>,
        val loading: Boolean,
        val canCancel: Boolean,
    ) : UiState
    /** Net een map gekozen maar nog niets geïndexeerd: korte voorbereidingsstaat. */
    data class Preparing(val folderName: String, val count: Int) : UiState
    /** De draaiende slideshow (de "home" van de app). */
    data class Show(
        val photo: PhotoRow?,
        val imageUrl: String?,
        val paused: Boolean,
        val captionEnabled: Boolean,
        val syncing: Boolean,
        val offlineHint: Boolean,
    ) : UiState
    data class Settings(val slideSeconds: Int, val shuffle: Boolean, val captionEnabled: Boolean) : UiState
    data class Error(val message: String) : UiState
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val store = TokenStore(app)
    private val db = PhotoDb(app)
    private val graph = GraphClient(::accessToken)
    private val sync = GraphSync(db, ::accessToken)
    private val media = GraphMedia(::accessToken)
    private val settings = Settings(app)

    private val _state = MutableStateFlow<UiState>(UiState.NeedsConnect)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var tokens: OneDriveAuth.Tokens? = null
    private var pollJob: Job? = null

    private var playlist: Playlist? = null
    private var showJob: Job? = null
    private var paused = false

    // Index-status (achtergrond) + verbindingsstatus.
    private var indexed = 0
    private var described = 0
    private var syncing = false
    private var syncProcessed = 0
    private var offlineHint = false
    private var syncJob: Job? = null

    init {
        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openFolder(Crumb(null, "OneDrive"), reset = true)
            else -> _state.value = UiState.NeedsConnect
        }
    }

    private suspend fun accessToken(): String {
        tokens?.let { if (it.expiresAtMillis > System.currentTimeMillis()) return it.accessToken }
        val rt = store.refreshToken ?: error("Niet gekoppeld")
        val fresh = OneDriveAuth.refresh(rt)
        tokens = fresh
        fresh.refreshToken?.let { store.refreshToken = it }
        return fresh.accessToken
    }

    fun connect() {
        viewModelScope.launch {
            try {
                val dc = OneDriveAuth.startDeviceCode()
                _state.value = UiState.ShowCode(dc)
                pollJob?.cancel()
                pollJob = viewModelScope.launch {
                    try {
                        val t = OneDriveAuth.pollForTokens(dc)
                        tokens = t
                        store.refreshToken = t.refreshToken
                        offlineHint = false
                        if (store.hasFolder) startShow() else openFolder(Crumb(null, "OneDrive"), reset = true)
                    } catch (e: Exception) {
                        _state.value = UiState.Error(Errors.message(e))
                    }
                }
            } catch (e: Exception) {
                _state.value = UiState.Error(Errors.message(e))
            }
        }
    }

    // --- Mapkeuze (behoudt altijd de koppeling) ---

    /** Open de mapkiezer zonder de koppeling te wissen — "Andere map". */
    fun changeFolder() {
        showJob?.cancel()
        openFolder(Crumb(null, "OneDrive"), reset = true)
    }

    /** Annuleren in de kiezer: terug naar de show als er al een map is. */
    fun cancelFolderPick() {
        if (store.hasFolder) resumeShow()
    }

    fun openFolder(crumb: Crumb, reset: Boolean = false) {
        val current = _state.value
        val path = when {
            reset -> listOf(crumb)
            current is UiState.PickFolder -> current.path + crumb
            else -> listOf(crumb)
        }
        loadFolder(path)
    }

    fun back() {
        val current = _state.value as? UiState.PickFolder ?: return
        if (current.path.size <= 1) return
        loadFolder(current.path.dropLast(1))
    }

    private fun loadFolder(path: List<Crumb>) {
        _state.value = UiState.PickFolder(path, emptyList(), emptyList(), loading = true, canCancel = store.hasFolder)
        viewModelScope.launch {
            try {
                val folders = graph.listFolders(path.last().id)
                val suggestions = if (path.size == 1) detectSuggestions() else emptyList()
                _state.value = UiState.PickFolder(path, folders, suggestions, loading = false, canCancel = store.hasFolder)
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
        val current = _state.value as? UiState.PickFolder ?: return
        val crumb = current.path.last()
        val id = crumb.id ?: run {
            _state.value = UiState.Error("Kies een submap, niet de hele OneDrive-root.")
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
            syncJob?.cancel()
            store.folderId = id
            store.folderName = name
            withContext(Dispatchers.IO) { db.clearIndex() }
            indexed = 0; described = 0; syncProcessed = 0
            playlist = null
            startShow()
        }
    }

    // --- Slideshow (de centrale staat) + automatische achtergrond-indexering ---

    fun startShow() {
        viewModelScope.launch {
            val photos = withContext(Dispatchers.IO) { db.allPhotos() }
            if (photos.isEmpty()) {
                pushPreparing()
                maybeStartSync()
                return@launch
            }
            playlist = if (settings.shuffle) {
                Playlist.shuffled(photos.map { it.id }, Random.Default)
            } else {
                Playlist.ordered(PhotoOrder.chronological(photos))
            }
            paused = false
            runShow()
            maybeStartSync() // achtergrond-verversing voor nieuwe foto's
        }
    }

    /** Hervat de bestaande show (na instellingen / annuleren), of start vers als er nog niets is. */
    private fun resumeShow() {
        if (playlist != null) runShow() else startShow()
    }

    private fun runShow() {
        showJob?.cancel()
        showJob = viewModelScope.launch {
            showCurrent()
            while (isActive) {
                delay(settings.slideSeconds * 1000L)
                if (paused) continue
                playlist?.next()
                showCurrent()
            }
        }
    }

    private suspend fun showCurrent() {
        val id = playlist?.current ?: return
        val photo = withContext(Dispatchers.IO) { db.get(id) }
        val url = try {
            urlFor(id)
        } catch (e: Exception) {
            // Verlopen koppeling of netwerkblip: niet hard stoppen — toon het hintje en draai door.
            offlineHint = true
            null
        }
        if (url != null) offlineHint = false
        _state.value = UiState.Show(
            photo = photo,
            imageUrl = url,
            paused = paused,
            captionEnabled = settings.captionEnabled,
            syncing = syncing,
            offlineHint = offlineHint,
        )
        prefetch()
    }

    private fun pushPreparing() {
        _state.value = UiState.Preparing(store.folderName ?: "Gekozen map", syncProcessed)
    }

    private suspend fun refreshCounts() {
        val result = withContext(Dispatchers.IO) { db.count() to db.countWithDescription() }
        indexed = result.first
        described = result.second
    }

    /** Start een achtergrond-crawl als er nog geen loopt; vult de lopende show aan met nieuwe foto's. */
    private fun maybeStartSync() {
        val folderId = store.folderId ?: return
        if (syncJob?.isActive == true) return
        syncing = true
        syncProcessed = 0
        syncJob = viewModelScope.launch {
            try {
                sync.sync(folderId) { count ->
                    // Callback draait op de IO-dispatcher (binnen sync.sync) → db-calls zijn veilig.
                    syncProcessed = count
                    indexed = db.count()
                    val s = _state.value
                    if (s is UiState.Preparing) {
                        if (indexed > 0) startShow() else _state.value = UiState.Preparing(s.folderName, syncProcessed)
                    }
                }
                refreshCounts()
                // Nieuwe foto's vanzelf aan de lopende show toevoegen.
                if (_state.value is UiState.Show) {
                    val ids = withContext(Dispatchers.IO) { db.allIds() }
                    playlist?.append(ids)
                }
            } catch (e: Exception) {
                // Achtergrond: stil falen; we tonen gewoon wat al geïndexeerd is (+ offline-hint).
                if (e is OneDriveAuth.ReauthRequired) offlineHint = true
            } finally {
                syncing = false
            }
        }
    }

    // Stabiele thumbnail-URL per foto, zodat prefetch en weergave dezelfde URL (= Coil-cachesleutel) delen.
    private val urlCache = HashMap<String, String>()

    private suspend fun urlFor(id: String): String? =
        urlCache[id] ?: media.thumbnailUrl(id)?.also {
            if (urlCache.size > 2000) urlCache.clear()
            urlCache[id] = it
        }

    /** Warm de buren rondom de huidige foto in Coil's cache, zodat wisselen direct is. */
    private fun prefetch() {
        val ids = playlist?.window(ahead = 3, behind = 1) ?: return
        viewModelScope.launch {
            val ctx = getApplication<Application>()
            val loader = SingletonImageLoader.get(ctx)
            for (id in ids) {
                val url = runCatching { urlFor(id) }.getOrNull() ?: continue
                loader.enqueue(ImageRequest.Builder(ctx).data(url).build())
            }
        }
    }

    fun nextPhoto() { playlist?.next(); runShow() }
    fun previousPhoto() { playlist?.previous(); runShow() }

    fun togglePause() {
        paused = !paused
        (_state.value as? UiState.Show)?.let { _state.value = it.copy(paused = paused) }
    }

    // --- Instellingen ---

    fun openSettings() {
        showJob?.cancel() // pauzeer de show-lus zodat hij het instellingenscherm niet overschrijft
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle, settings.captionEnabled)
    }

    fun setSlideSeconds(seconds: Int) {
        settings.slideSeconds = seconds
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle, settings.captionEnabled)
    }

    fun setShuffle(shuffle: Boolean) {
        settings.shuffle = shuffle
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle, settings.captionEnabled)
    }

    fun setCaptionEnabled(enabled: Boolean) {
        settings.captionEnabled = enabled
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle, settings.captionEnabled)
    }

    fun closeSettings() = resumeShow()

    // --- Fouten & koppeling ---

    /** Centrale foutafhandeling: verlopen koppeling → opnieuw inloggen; anders nette melding. */
    private fun handleError(e: Throwable) {
        if (e is OneDriveAuth.ReauthRequired) {
            store.refreshToken = null // forceert NeedsConnect bij 'Opnieuw'
            tokens = null
            pollJob?.cancel()
            showJob?.cancel()
            syncJob?.cancel()
            _state.value = UiState.Error("Je OneDrive-koppeling is verlopen. Kies 'Opnieuw' om weer in te loggen.")
        } else {
            _state.value = UiState.Error(Errors.message(e))
        }
    }

    fun retry() {
        pollJob?.cancel()
        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openFolder(Crumb(null, "OneDrive"), reset = true)
            else -> _state.value = UiState.NeedsConnect
        }
    }

    /** Loskoppelen: wist token + map en gaat terug naar het koppelscherm (alleen vanuit Instellingen). */
    fun disconnect() {
        pollJob?.cancel()
        showJob?.cancel()
        syncJob?.cancel()
        tokens = null
        playlist = null
        indexed = 0; described = 0; syncProcessed = 0; syncing = false; offlineHint = false
        viewModelScope.launch {
            withContext(Dispatchers.IO) { db.clearIndex() }
            store.clear()
            _state.value = UiState.NeedsConnect
        }
    }
}
