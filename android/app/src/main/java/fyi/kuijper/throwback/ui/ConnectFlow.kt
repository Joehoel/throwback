package fyi.kuijper.throwback.ui

import androidx.compose.runtime.Composable
import fyi.kuijper.throwback.MainViewModel
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.screens.CodeScreen
import fyi.kuijper.throwback.ui.screens.ConnectScreen
import fyi.kuijper.throwback.ui.screens.ErrorScreen
import fyi.kuijper.throwback.ui.screens.FolderPickerScreen
import fyi.kuijper.throwback.ui.screens.PreparingScreen
import fyi.kuijper.throwback.ui.screens.SettingsScreen
import fyi.kuijper.throwback.ui.screens.SlideshowScreen

/**
 * Routeert de UiState naar het bijbehorende scherm. [onExitApp] sluit de app (tweede Terug in de
 * show); [onOpenScreensaverSettings] opent de Android screensaver-instelling.
 */
@Composable
fun ConnectFlow(
    state: UiState,
    vm: MainViewModel,
    onExitApp: () -> Unit,
    onOpenScreensaverSettings: () -> Unit,
) {
    when (state) {
        is UiState.NeedsConnect -> ConnectScreen(onConnect = vm::connect)
        is UiState.ShowCode -> CodeScreen(state)
        is UiState.PickFolder -> FolderPickerScreen(
            state = state,
            onOpen = { vm.openFolder(it) },
            onBack = vm::back,
            onSelect = vm::selectCurrentFolder,
            onSelectSuggestion = vm::selectSuggestion,
            onCancel = vm::cancelFolderPick,
        )
        is UiState.Preparing -> PreparingScreen(state)
        is UiState.Show -> SlideshowScreen(
            state = state,
            onNext = vm::nextPhoto,
            onPrev = vm::previousPhoto,
            onTogglePause = vm::togglePause,
            onChangeFolder = vm::changeFolder,
            onOpenSettings = vm::openSettings,
            onExitApp = onExitApp,
        )
        is UiState.Settings -> SettingsScreen(
            state = state,
            onSeconds = vm::setSlideSeconds,
            onShuffle = vm::setShuffle,
            onCaption = vm::setCaptionEnabled,
            onClose = vm::closeSettings,
            onOpenScreensaverSettings = onOpenScreensaverSettings,
            onDisconnect = vm::disconnect,
        )
        is UiState.Error -> ErrorScreen(state, onRetry = vm::retry)
    }
}
