package fyi.kuijper.throwback

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fyi.kuijper.throwback.onedrive.DriveItem
import fyi.kuijper.throwback.onedrive.GraphClient
import fyi.kuijper.throwback.onedrive.GraphMedia
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import fyi.kuijper.throwback.onedrive.PhotoDb
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.TokenStore
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
    data class Error(val message: String) : UiState
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val store = TokenStore(app)
    private val db = PhotoDb(app)
    private val graph = GraphClient(::accessToken)
    private val sync = GraphSync(db, ::accessToken)
    private val media = GraphMedia(::accessToken)

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
                        openFolder(Crumb(null, "OneDrive"), reset = true)
                    } catch (e: Exception) {
                        _state.value = UiState.Error(e.message ?: "Inloggen mislukt")
                    }
                }
            } catch (e: Exception) {
                _state.value = UiState.Error(e.message ?: "Koppelen mislukt")
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
                _state.value = UiState.Error(e.message ?: "Map laden mislukt")
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
                _state.value = UiState.Error(e.message ?: "Indexeren mislukt")
            }
        }
    }

    // --- Slideshow ---

    fun startShow() {
        viewModelScope.launch {
            val ids = withContext(Dispatchers.IO) { db.allIds() }
            if (ids.isEmpty()) {
                goReady()
                return@launch
            }
            playlist = Playlist.shuffled(ids, Random.Default)
            paused = false
            runShow()
        }
    }

    private fun runShow() {
        showJob?.cancel()
        showJob = viewModelScope.launch {
            showCurrent()
            while (isActive) {
                delay(SLIDE_MS)
                if (paused) continue
                playlist?.next()
                showCurrent()
            }
        }
    }

    private suspend fun showCurrent() {
        val id = playlist?.current ?: return
        val photo = withContext(Dispatchers.IO) { db.get(id) }
        val url = runCatching { media.thumbnailUrl(id) }.getOrNull()
        _state.value = UiState.Show(photo, url, paused)
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

    companion object {
        private const val SLIDE_MS = 8000L
    }
}
