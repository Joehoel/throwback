package fyi.kuijper.throwback

import fyi.kuijper.throwback.onedrive.DriveItem
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import fyi.kuijper.throwback.onedrive.PhotoRow

/** One folder in the picker's navigation path (root = id null). */
data class Crumb(val id: String?, val name: String)

/** An auto-detected photo folder (camera album / photos) offered at the top. */
data class FolderSuggestion(val id: String, val name: String, val childCount: Int)

/**
 * The state a screen consumes. Derived by [MainViewModel] from the navigation flow ([Nav]) combined
 * with the shared engines (slideshow/sync/settings), so the UI knows nothing of that underlying state.
 */
sealed interface UiState {
    /** First frame while we synchronously know we're connected but the index is still loading. */
    data object Loading : UiState
    data object NeedsConnect : UiState
    data class ShowCode(val code: OneDriveAuth.DeviceCode) : UiState
    data class PickFolder(
        val path: List<Crumb>,
        val folders: List<DriveItem>,
        val suggestions: List<FolderSuggestion>,
        val loading: Boolean,
        val canCancel: Boolean,
        /** A folder was just chosen; the "Kies deze map" button shows a loading state until photos arrive. */
        val preparing: Boolean,
    ) : UiState
    /** The running slideshow (the app's "home"). */
    data class Show(
        val photo: PhotoRow?,
        val imageUrl: String?,
        val paused: Boolean,
        val captionEnabled: Boolean,
        val syncing: Boolean,
        val offlineHint: Boolean,
        /** Experimental native-resolution SurfaceView renderer instead of the Compose one. */
        val surfaceRenderer: Boolean,
    ) : UiState
    data class Settings(
        val slideSeconds: Int,
        val shuffle: Boolean,
        val captionEnabled: Boolean,
        val surfaceRenderer: Boolean,
        val indexed: Int = 0,        // photos in the index (the count shown when idle)
        val processed: Int = 0,      // photos handled this run — the indexing progress numerator
        val total: Int = 0,          // photos in the folder — the progress denominator
        val located: Int = 0,        // photos with GPS (the geocoding denominator)
        val geocoded: Int = 0,       // photos given a place label
        val indexing: Boolean = false,
        val syncError: String? = null,
    ) : UiState
    data class Error(val message: String) : UiState
}

/**
 * The app's navigation flow: the discrete "where are we" state owned by [MainViewModel]. Deliberately
 * decoupled from [UiState] so transitions live in one place (the coordinator), with the ongoing engine
 * state (photo, sync progress, settings) combined in separately.
 */
sealed interface Nav {
    /** Determined synchronously at start: connected, index loading → shows [UiState.Loading]. */
    data object Booting : Nav
    data object Connect : Nav
    data class ShowingCode(val code: OneDriveAuth.DeviceCode) : Nav
    /** Marker; the browse state (path/folders/suggestions/preparing) lives in [engine.FolderPicker]. */
    data object PickingFolder : Nav
    data object Showing : Nav
    data object SettingsOpen : Nav
    data class Failed(val message: String) : Nav
}
