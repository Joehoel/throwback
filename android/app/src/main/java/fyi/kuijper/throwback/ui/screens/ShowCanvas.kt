package fyi.kuijper.throwback.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.surface.Surface4kCanvas

/** Crossfade lengths: a slow dissolve for the automatic slide change, a quick one for manual stepping. */
private const val AUTO_CROSSFADE_MS = 1500
private const val MANUAL_CROSSFADE_MS = 200

/**
 * Picks the renderer for a [UiState.Show] — the experimental native-resolution [Surface4kCanvas] when the
 * 4K toggle is on, otherwise the default [SlideshowCanvas] — and maps the state onto its inputs once. Shared
 * by the in-app show ([SlideshowScreen]) and the screensaver (DreamService), which differ only in [paused]
 * (the show pauses; the screensaver never does), so the two call sites can't drift in how they wire the canvas.
 *
 * This is also the single place that turns the "was this a manual step?" signal ([UiState.Show.userInitiated])
 * into a crossfade length, so both renderers stay in sync without each re-deciding it.
 */
@Composable
fun ShowCanvas(state: UiState.Show, paused: Boolean, modifier: Modifier = Modifier) {
    val slideMillis = state.slideSeconds * 1000
    val crossfadeMillis = if (state.userInitiated) MANUAL_CROSSFADE_MS else AUTO_CROSSFADE_MS
    if (state.surfaceRenderer) {
        Surface4kCanvas(
            imageUrl = state.imageUrl,
            photo = state.photo,
            captionEnabled = state.captionEnabled,
            offlineHint = state.offlineHint,
            paused = paused,
            modifier = modifier,
            slideMillis = slideMillis,
            crossfadeMillis = crossfadeMillis,
        )
    } else {
        SlideshowCanvas(
            imageUrl = state.imageUrl,
            photo = state.photo,
            captionEnabled = state.captionEnabled,
            offlineHint = state.offlineHint,
            paused = paused,
            modifier = modifier,
            slideMillis = slideMillis,
            crossfadeMillis = crossfadeMillis,
        )
    }
}
