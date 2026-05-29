@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import fyi.kuijper.throwback.ui.components.rememberInitialFocus
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
    onClose: () -> Unit,
    onOpenScreensaverSettings: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val focus = rememberInitialFocus()
    TvScreen {
        Column(Modifier.widthIn(max = 820.dp)) {
            ScreenHeader(title = "Instellingen")
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
            Spacer(Modifier.height(SpaceXl))
            Row(horizontalArrangement = Arrangement.spacedBy(SpaceM)) {
                ActionButton("Stel in als screensaver", Icons.Default.Tv, onOpenScreensaverSettings)
                ActionButton("Loskoppelen", Icons.Default.LinkOff, onDisconnect)
            }
            Spacer(Modifier.height(SpaceM))
            ActionButton("Terug", Icons.AutoMirrored.Filled.ArrowBack, onClose)
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
