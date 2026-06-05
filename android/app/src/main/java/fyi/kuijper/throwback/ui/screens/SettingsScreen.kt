@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Tv
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.ActionButton
import fyi.kuijper.throwback.ui.components.ScreenHeader
import fyi.kuijper.throwback.ui.components.SwitchRow
import fyi.kuijper.throwback.ui.components.WideRow
import fyi.kuijper.throwback.ui.components.rememberInitialFocus
import fyi.kuijper.throwback.ui.theme.ContentMaxWidth
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceXl
import fyi.kuijper.throwback.ui.theme.TvScreen

@Composable
fun SettingsScreen(
    state: UiState.Settings,
    onSeconds: (Int) -> Unit,
    onShuffle: (Boolean) -> Unit,
    onCaption: (Boolean) -> Unit,
    onSurfaceRenderer: (Boolean) -> Unit,
    onClose: () -> Unit,
    onOpenScreensaverSettings: () -> Unit,
    onDisconnect: () -> Unit,
    screensaverConfigurable: Boolean,
) {
    val focus = rememberInitialFocus()
    // Back returns to the photo show, not out of the app.
    BackHandler { onClose() }
    // horizontalPadding = 0: the scroll container fills the full width and clips there, while content
    // is capped at ContentMaxWidth and centered. This gives the focus scale (1.1×) room inside the
    // clip; the overscan margin lives in the (empty) centering space.
    TvScreen(horizontalPadding = 0.dp) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
          Column(Modifier.widthIn(max = ContentMaxWidth)) {
            ScreenHeader(title = "Instellingen")
            IndexStatus(state)
            Spacer(Modifier.height(SpaceL))
            SecondsRow(
                seconds = state.slideSeconds,
                onChange = onSeconds,
                minusFocus = Modifier.focusRequester(focus),
            )
            Spacer(Modifier.height(SpaceM))
            SwitchRow(
                title = "Volgorde",
                subtitle = if (state.shuffle) "Shuffle (willekeurig)" else "Chronologisch",
                checked = state.shuffle,
                onToggle = { onShuffle(!state.shuffle) },
            )
            Spacer(Modifier.height(SpaceM))
            SwitchRow(
                title = "Bijschrift",
                subtitle = if (state.captionEnabled) "Datum en gebeurtenis tonen" else "Verborgen",
                checked = state.captionEnabled,
                onToggle = { onCaption(!state.captionEnabled) },
            )
            Spacer(Modifier.height(SpaceM))
            SwitchRow(
                title = "4K-renderer (experimenteel)",
                subtitle = if (state.surfaceRenderer)
                    "Aan — scherper op 4K-schermen"
                else
                    "Uit — standaard renderer",
                checked = state.surfaceRenderer,
                onToggle = { onSurfaceRenderer(!state.surfaceRenderer) },
            )
            // Only shown when the device exposes a screensaver setting (not every emulator/TV does).
            if (screensaverConfigurable) {
                Spacer(Modifier.height(SpaceM))
                WideRow(
                    title = "Screensaver instellen",
                    icon = Icons.Default.Tv,
                    subtitle = "Open de TV-instellingen en kies Throwback bij Screensaver",
                    onClick = onOpenScreensaverSettings,
                )
            }
            Spacer(Modifier.height(SpaceM))
            WideRow(
                title = "Loskoppelen",
                icon = Icons.Default.LinkOff,
                subtitle = "OneDrive-koppeling wissen en opnieuw beginnen",
                onClick = onDisconnect,
            )
            Spacer(Modifier.height(SpaceXl))
            ActionButton("Terug", Icons.AutoMirrored.Filled.ArrowBack, onClose)
            Spacer(Modifier.height(SpaceL))
          }
        }
    }
}

@Composable
private fun IndexStatus(state: UiState.Settings) {
    val index = indexStatusText(state)
    val geocode = geocodeStatusText(state)
    if (index == null && geocode == null) return
    Column {
        listOfNotNull(index, geocode).forEach { line ->
            Text(
                line,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SecondsRow(
    seconds: Int,
    onChange: (Int) -> Unit,
    minusFocus: Modifier,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Seconden per foto", style = MaterialTheme.typography.titleMedium)
            Text(
                "Hoe lang elke foto in beeld blijft",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Button(
            onClick = { onChange((seconds - 1).coerceAtLeast(1)) },
            modifier = minusFocus,
        ) {
            Icon(Icons.Default.Remove, contentDescription = "Korter", modifier = Modifier.size(24.dp))
        }
        Text(
            "$seconds s",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(96.dp),
        )
        Button(onClick = { onChange(seconds + 1) }) {
            Icon(Icons.Default.Add, contentDescription = "Langer", modifier = Modifier.size(24.dp))
        }
    }
}
