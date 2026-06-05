@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.tv.material3.ExperimentalTvMaterial3Api
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.ActionButton
import fyi.kuijper.throwback.ui.theme.SpaceM

/** How long the control bar stays up after the last interaction before auto-hiding. */
private const val CONTROLS_HIDE_DELAY_MS = 8_000L

@Composable
fun SlideshowScreen(
    state: UiState.Show,
    onNext: () -> Unit,
    onPrev: () -> Unit,
    onTogglePause: () -> Unit,
    onChangeFolder: () -> Unit,
    onOpenSettings: () -> Unit,
    onExitApp: () -> Unit,
) {
    var controlsVisible by remember { mutableStateOf(false) }
    val showFocus = remember { FocusRequester() }
    val barFocus = remember { FocusRequester() }

    // Down opens the control bar (see onPreviewKeyEvent). Back closes the bar, or exits the app if the
    // bar is already hidden.
    BackHandler(enabled = true) {
        if (controlsVisible) controlsVisible = false else onExitApp()
    }

    // The bar auto-hides after a while of inactivity; focus returns to the show.
    LaunchedEffect(controlsVisible) {
        if (controlsVisible) {
            runCatching { barFocus.requestFocus() }
            kotlinx.coroutines.delay(CONTROLS_HIDE_DELAY_MS)
            controlsVisible = false
        } else {
            runCatching { showFocus.requestFocus() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(showFocus)
            .focusable()
            // Down opens the control bar; Down again closes it (Back does too). While the bar is open
            // the other keys fall through to its buttons. onPreviewKeyEvent (top-down) so this outer
            // Box catches Down before a focused bar button consumes it as a focus move.
            .onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                if (controlsVisible) {
                    if (e.key == Key.DirectionDown) { controlsVisible = false; true } else false
                } else when (e.key) {
                    Key.DirectionDown -> { controlsVisible = true; true }
                    Key.DirectionLeft -> { onPrev(); true }
                    Key.DirectionRight -> { onNext(); true }
                    Key.DirectionCenter, Key.Enter -> { onTogglePause(); true }
                    else -> false
                }
            },
    ) {
        if (fyi.kuijper.throwback.ui.surface.Experiments.USE_SURFACE_RENDERER) {
            fyi.kuijper.throwback.ui.surface.Surface4kCanvas(
                imageUrl = state.imageUrl,
                photo = state.photo,
                captionEnabled = state.captionEnabled,
                offlineHint = state.offlineHint,
                paused = state.paused && !controlsVisible,
            )
        } else {
            SlideshowCanvas(
                imageUrl = state.imageUrl,
                photo = state.photo,
                captionEnabled = state.captionEnabled,
                offlineHint = state.offlineHint,
                paused = state.paused && !controlsVisible,
            )
        }

        AnimatedVisibility(
            visible = controlsVisible,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            ControlBar(
                paused = state.paused,
                onTogglePause = { onTogglePause(); controlsVisible = false },
                onChangeFolder = onChangeFolder,
                onOpenSettings = onOpenSettings,
                firstFocus = barFocus,
            )
        }
    }
}

@Composable
private fun ControlBar(
    paused: Boolean,
    onTogglePause: () -> Unit,
    onChangeFolder: () -> Unit,
    onOpenSettings: () -> Unit,
    firstFocus: FocusRequester,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
            .padding(horizontal = 48.dp, vertical = 32.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(SpaceM)) {
            ActionButton(
                label = if (paused) "Hervatten" else "Pauze",
                icon = if (paused) Icons.Default.PlayArrow else Icons.Default.Pause,
                onClick = onTogglePause,
                modifier = Modifier.focusRequester(firstFocus),
                primary = true,
            )
            ActionButton("Andere map", Icons.Default.Folder, onChangeFolder)
            ActionButton("Instellingen", Icons.Default.Settings, onOpenSettings)
        }
    }
}
