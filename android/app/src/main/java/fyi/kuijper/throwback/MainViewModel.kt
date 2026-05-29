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

sealed interface UiState {
    data object NeedsConnect : UiState
    data class ShowCode(val code: OneDriveAuth.DeviceCode) : UiState
    data class PickFolder(
        val path: List<Crumb>,
        val folders: List<DriveItem>,
        val loading: Boolean,
    ) : UiState
    data class Ready(val folderName: String, val indexed: Int, val described: Int) : UiState
    data class Syncing(val folderName: String, val count: Int) : UiState
    /** De draaiende slideshow. */
    data class Show(val photo: PhotoRow?, val imageUrl: String?, val paused: Boolean) : UiState
    data class Settings(val slideSeconds: Int, val shuffle: Boolean) : UiState
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

    init {
        when {
            store.isConnected && store.hasFolder -> goReady()
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
                        if (store.hasFolder) goReady() else openFolder(Crumb(null, "OneDrive"), reset = true)
                    } catch (e: Exception) {
                        _state.value = UiState.Error(Errors.message(e))
                    }
                }
            } catch (e: Exception) {
                _state.value = UiState.Error(Errors.message(e))
            }
        }
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
        _state.value = UiState.PickFolder(path, emptyList(), loading = true)
        viewModelScope.launch {
            try {
                val folders = graph.listFolders(path.last().id)
                _state.value = UiState.PickFolder(path, folders, loading = false)
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    fun selectCurrentFolder() {
        val current = _state.value as? UiState.PickFolder ?: return
        val crumb = current.path.last()
        val id = crumb.id ?: run {
            _state.value = UiState.Error("Kies een submap, niet de hele OneDrive-root.")
            return
        }
        viewModelScope.launch {
            store.folderId = id
            store.folderName = crumb.name
            withContext(Dispatchers.IO) { db.clearIndex() }
            goReady()
        }
    }

    private fun goReady() {
        val name = store.folderName ?: "Gekozen map"
        viewModelScope.launch {
            val (total, described) = withContext(Dispatchers.IO) { db.count() to db.countWithDescription() }
            _state.value = UiState.Ready(name, total, described)
        }
    }

    fun startSync() {
        val folderId = store.folderId ?: return
        val name = store.folderName ?: "Gekozen map"
        _state.value = UiState.Syncing(name, 0)
        viewModelScope.launch {
            try {
                sync.sync(folderId) { count -> _state.value = UiState.Syncing(name, count) }
                goReady()
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    // --- Slideshow ---

    fun startShow() {
        viewModelScope.launch {
            val photos = withContext(Dispatchers.IO) { db.allPhotos() }
            if (photos.isEmpty()) {
                goReady()
                return@launch
            }
            playlist = if (settings.shuffle) {
                Playlist.shuffled(photos.map { it.id }, Random.Default)
            } else {
                Playlist.ordered(PhotoOrder.chronological(photos))
            }
            paused = false
            runShow()
        }
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

    // --- Instellingen ---

    fun openSettings() {
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle)
    }

    fun setSlideSeconds(seconds: Int) {
        settings.slideSeconds = seconds
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle)
    }

    fun setShuffle(shuffle: Boolean) {
        settings.shuffle = shuffle
        _state.value = UiState.Settings(settings.slideSeconds, settings.shuffle)
    }

    fun closeSettings() = goReady()

    private suspend fun showCurrent() {
        val id = playlist?.current ?: return
        val photo = withContext(Dispatchers.IO) { db.get(id) }
        val url = try {
            urlFor(id)
        } catch (e: OneDriveAuth.ReauthRequired) {
            handleError(e) // koppeling verlopen → stop de show, vraag opnieuw inloggen
            return
        } catch (e: Exception) {
            null // losse netwerkblip: toon deze foto leeg, ga gewoon door
        }
        _state.value = UiState.Show(photo, url, paused)
        prefetch()
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

    /** Centrale foutafhandeling: verlopen koppeling → opnieuw inloggen; anders nette melding. */
    private fun handleError(e: Throwable) {
        if (e is OneDriveAuth.ReauthRequired) {
            store.refreshToken = null // forceert NeedsConnect bij 'Opnieuw'
            tokens = null
            pollJob?.cancel()
            showJob?.cancel()
            _state.value = UiState.Error("Je OneDrive-koppeling is verlopen. Kies 'Opnieuw' om weer in te loggen.")
        } else {
            _state.value = UiState.Error(Errors.message(e))
        }
    }

    fun nextPhoto() { playlist?.next(); runShow() }
    fun previousPhoto() { playlist?.previous(); runShow() }

    fun togglePause() {
        paused = !paused
        (_state.value as? UiState.Show)?.let { _state.value = it.copy(paused = paused) }
    }

    fun exitShow() {
        showJob?.cancel()
        goReady()
    }

    fun retry() {
        pollJob?.cancel()
        when {
            store.isConnected && store.hasFolder -> goReady()
            store.isConnected -> openFolder(Crumb(null, "OneDrive"), reset = true)
            else -> _state.value = UiState.NeedsConnect
        }
    }

    fun disconnect() {
        pollJob?.cancel()
        showJob?.cancel()
        tokens = null
        viewModelScope.launch {
            withContext(Dispatchers.IO) { db.clearIndex() }
            store.clear()
            _state.value = UiState.NeedsConnect
        }
    }
}
