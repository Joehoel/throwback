package fyi.kuijper.throwback

import fyi.kuijper.throwback.onedrive.DriveItem
import fyi.kuijper.throwback.onedrive.OneDriveAuth
import fyi.kuijper.throwback.onedrive.PhotoRow

/** Eén map in het navigatiepad van de kiezer (root = id null). */
data class Crumb(val id: String?, val name: String)

/** Een automatisch gevonden fotomap (camera-album / foto's) die we bovenaan aanbieden. */
data class FolderSuggestion(val id: String, val name: String, val childCount: Int)

/**
 * De toestand die een scherm consumeert. Wordt door [MainViewModel] afgeleid uit de
 * navigatie-flow ([Nav]) gecombineerd met de gedeelde engines (slideshow/sync/settings) —
 * de UI hoeft dus niets te weten van die onderliggende state.
 */
sealed interface UiState {
    /** Eerste frame terwijl we (synchroon) al weten dat we gekoppeld zijn maar de index nog laden. */
    data object Loading : UiState
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
    data class Settings(
        val slideSeconds: Int,
        val shuffle: Boolean,
        val captionEnabled: Boolean,
        val indexed: Int = 0,
        val indexing: Boolean = false,
        val syncError: String? = null,
    ) : UiState
    data class Error(val message: String) : UiState
}

/**
 * De navigatie-flow van de app: de discrete "waar zijn we"-staat die de [MainViewModel] bezit.
 * Bewust losgekoppeld van [UiState] zodat de transities op één plek (de coördinator) zitten en
 * de doorlopende engine-state (foto, sync-voortgang, instellingen) er apart in gecombineerd wordt.
 */
sealed interface Nav {
    /** Synchroon bepaald bij start: we zijn gekoppeld, index wordt geladen → toont [UiState.Loading]. */
    data object Booting : Nav
    data object Connect : Nav
    data class ShowingCode(val code: OneDriveAuth.DeviceCode) : Nav
    data class PickingFolder(
        val path: List<Crumb>,
        val folders: List<DriveItem>,
        val suggestions: List<FolderSuggestion>,
        val loading: Boolean,
        val canCancel: Boolean,
    ) : Nav
    data object Preparing : Nav
    data object Showing : Nav
    data object SettingsOpen : Nav
    data class Failed(val message: String) : Nav
}
