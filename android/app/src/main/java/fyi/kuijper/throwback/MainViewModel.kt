package fyi.kuijper.throwback

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fyi.kuijper.throwback.engine.FolderPicker
import fyi.kuijper.throwback.engine.SlideshowEngine
import fyi.kuijper.throwback.engine.SyncEngine
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import io.sentry.SentryLevel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Coordinator: owns only the navigation flow ([Nav]) and derives [UiState] from it, combined with the
 * shared engines (slideshow/sync/settings). The ongoing state (playlist, sync progress, settings) lives
 * in the engines from [AppContainer], not here, so all mutable state sits with its owner and nothing
 * has to be synced by hand.
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

    // Load errors are routed via handleError (re-login etc.).
    private val picker = FolderPicker(graph, viewModelScope, ::handleError)

    // Determined synchronously at start from SharedPreferences: connected → Booting (Loading), never the
    // connect screen. Avoids the connect-screen flash that occurred when the initial value was
    // NeedsConnect while the async DB read was still running.
    private val navFlow = MutableStateFlow<Nav>(
        if (store.isConnected) Nav.Booting else Nav.Connect
    )

    private var connectJob: Job? = null

    // The single in-flight "wait for the first photos, then start the show" waiter (the boot handshake).
    // A new folder choice / retry cancels it, so at most one runs and the show starts exactly once.
    private var firstPhotosJob: Job? = null

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
            pick.path, pick.folders, pick.suggestions, pick.loading,
            canCancel = store.hasFolder, preparing = pick.preparing,
        )
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
            total = syncS.total,
            located = syncS.located,
            geocoded = syncS.geocoded,
            indexing = syncS.syncing,
            syncError = syncS.lastError,
        )
        is Nav.Failed -> UiState.Error(nav.message)
    }

    init {
        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openRootFolder()
            else -> {} // navFlow is already on Connect
        }
    }

    fun connect() {
        connectJob?.cancel()
        connectJob = viewModelScope.launch {
            Telemetry.breadcrumb("connect: start device-code login", "user")
            try {
                val dc = session.startDeviceCode()
                navFlow.value = Nav.ShowingCode(dc)
                session.completeLogin(dc)
                if (store.hasFolder) startShow() else openRootFolder()
            } catch (e: Exception) {
                Telemetry.captureHandled(e, "auth.login")
                navFlow.value = Nav.Failed(Errors.message(e))
            }
        }
    }

    private fun openRootFolder() {
        navFlow.value = Nav.PickingFolder
        picker.openRoot()
    }

    /** Open the folder picker without clearing the connection — "Other folder". */
    fun changeFolder() {
        Telemetry.breadcrumb("user opened the folder picker", "user")
        slideshow.stop()
        openRootFolder()
    }

    /** Cancel in the picker: back to the show if a folder already exists. */
    fun cancelFolderPick() {
        if (store.hasFolder) resumeShow()
    }

    fun openFolder(crumb: Crumb) = picker.open(crumb)

    fun back() = picker.back()

    fun selectSuggestion(suggestion: FolderSuggestion) = onFolderChosen(Crumb(suggestion.id, suggestion.name))

    fun selectCurrentFolder() {
        picker.chooseCurrent()?.let(::onFolderChosen)
    }

    /** The user chose a root folder. Same folder → resume; otherwise reindex on that folder. */
    private fun onFolderChosen(crumb: Crumb) {
        val id = crumb.id ?: return
        if (id == store.folderId) {
            resumeShow()
            return
        }
        // Show the loading state on the picker's choose button straight away (no flicker frame).
        picker.markPreparing()
        viewModelScope.launch {
            // Keep the per-folder index: wipe nothing. Only reset the running show + sync so they pick up
            // the new folder; an existing index for that folder is reused and delta-updated, else a fresh crawl.
            sync.cancel()
            store.folderId = id
            store.folderName = crumb.name
            slideshow.reset()
            sync.reset()
            startShow()
        }
    }

    fun startShow() {
        viewModelScope.launch {
            val folderId = store.folderId
            if (slideshow.hasPlaylist) {
                slideshow.resume()
                navFlow.value = Nav.Showing
                if (folderId != null) sync.ensure(folderId)
                return@launch
            }
            val photos = if (folderId != null) db.allPhotos(folderId) else emptyList()
            if (photos.isEmpty()) {
                // No index yet → wait for the first photos. From the picker we stay there (its choose
                // button shows the loading state); otherwise show the quiet loading frame.
                if (navFlow.value !is Nav.PickingFolder) navFlow.value = Nav.Booting
                if (folderId != null) {
                    sync.ensure(folderId)
                    awaitFirstPhotosThenStart()
                }
                return@launch
            }
            slideshow.start(photos, settings.shuffle)
            navFlow.value = Nav.Showing
            if (folderId != null) sync.ensure(folderId) // background refresh for new photos
        }
    }

    /** Are we on a screen that's waiting for the first photos to appear (picker-prepare or boot)? */
    private fun isAwaitingFirstPhotos(): Boolean = when (navFlow.value) {
        is Nav.Booting -> true
        is Nav.PickingFolder -> picker.state.value.preparing
        else -> false
    }

    /**
     * Wait until the background sync reports its first photos, then start the show — the boot
     * handshake as one place. Cancels any previous waiter first, so a folder switch or retry never
     * leaves a stale waiter that could start on the wrong folder, and the show starts exactly once.
     * New photos after that arrive via the sync engine appending them to the running show
     * (onAdded → slideshow.appendIds), so this only has to fire for the *first* batch.
     */
    private fun awaitFirstPhotosThenStart() {
        firstPhotosJob?.cancel()
        firstPhotosJob = viewModelScope.launch {
            sync.state.first { it.indexed > 0 }
            if (!isAwaitingFirstPhotos()) return@launch
            val root = store.folderId ?: return@launch
            if (!slideshow.hasPlaylist) {
                val photos = db.allPhotos(root)
                if (photos.isEmpty()) return@launch
                slideshow.start(photos, settings.shuffle)
            }
            navFlow.value = Nav.Showing
        }
    }

    /** Resume the existing show (after settings / cancel), or start fresh if there's nothing yet. */
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

    fun openSettings() {
        slideshow.stop() // pause the loop so it doesn't keep advancing while in settings
        navFlow.value = Nav.SettingsOpen
    }

    // Writing to [settings] updates settings.state → the combined UiState follows automatically.
    fun setSlideSeconds(seconds: Int) { settings.slideSeconds = seconds }
    fun setShuffle(shuffle: Boolean) { settings.shuffle = shuffle }
    fun setCaptionEnabled(enabled: Boolean) { settings.captionEnabled = enabled }

    fun closeSettings() = resumeShow()

    /** Central error handling: an expired connection also tears down the session so 'Retry' re-logs in. */
    private fun handleError(e: Throwable) {
        if (e is OneDriveAuth.ReauthRequired) {
            // Routine (refresh token expired) → INFO, not a warning; useful to see how often it happens.
            Telemetry.captureHandled(e, "auth.reauth", SentryLevel.INFO)
            session.invalidate() // forces NeedsConnect on 'Retry'
            connectJob?.cancel()
            slideshow.stop()
            sync.cancel()
        } else {
            Telemetry.captureHandled(e, "load")
        }
        navFlow.value = Nav.Failed(Errors.message(e))
    }

    fun retry() {
        Telemetry.breadcrumb("user tapped retry", "user")
        connectJob?.cancel()
        firstPhotosJob?.cancel()
        when {
            store.isConnected && store.hasFolder -> startShow()
            store.isConnected -> openRootFolder()
            else -> navFlow.value = Nav.Connect
        }
    }

    /** Disconnect: wipes token + folder and returns to the connect screen (only from Settings). */
    fun disconnect() {
        Telemetry.breadcrumb("user disconnected OneDrive", "user")
        connectJob?.cancel()
        firstPhotosJob?.cancel()
        slideshow.reset()
        sync.reset()
        viewModelScope.launch {
            db.clearAll()
            session.clear()
            navFlow.value = Nav.Connect
        }
    }
}
