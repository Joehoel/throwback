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
import java.util.Locale

@Composable
fun SettingsScreen(
    state: UiState.Settings,
    onSeconds: (Int) -> Unit,
    onShuffle: (Boolean) -> Unit,
    onCaption: (Boolean) -> Unit,
    onClose: () -> Unit,
    onOpenScreensaverSettings: () -> Unit,
    onDisconnect: () -> Unit,
    screensaverConfigurable: Boolean,
) {
    val focus = rememberInitialFocus()
    // Terug brengt je naar de fotoshow terug — niet de app uit.
    BackHandler { onClose() }
    // horizontalPadding = 0: de scroll-container vult de volle schermbreedte en clipt daarop, terwijl
    // de inhoud op ContentMaxWidth gecapt + gecentreerd wordt. Zo heeft de focus-schaal (1.1×) ruimte
    // binnen de clip i.p.v. afgekapt te worden — de overscan-marge zit nu in de (lege) centreerruimte.
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
            // Alleen tonen als het toestel een screensaver-instelling heeft (niet op elke emulator/TV).
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

/** Subtiel statusregeltje onder de titel: hoeveel foto's geïndexeerd zijn en of er bijgewerkt wordt. */
@Composable
private fun IndexStatus(state: UiState.Settings) {
    if (state.indexed == 0 && !state.indexing) return
    fun fmt(n: Int) = String.format(Locale("nl", "NL"), "%,d", n)
    val count = fmt(state.indexed)
    val text = when {
        // Volledige crawl met bekend totaal: toon "verwerkt / totaal".
        state.indexing && state.processed > 0 && state.indexed > state.processed ->
            "Indexeren… ${fmt(state.processed)} / $count foto's"
        // Eerste crawl (nog geen totaal bekend): toon enkel het lopende aantal.
        state.indexing && state.processed > 0 -> "Indexeren… ${fmt(state.processed)} foto's"
        state.indexing -> "Bibliotheek bijwerken…"
        state.syncError != null -> "$count foto's · laatste verversing mislukt"
        else -> "$count foto's geïndexeerd"
    }
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
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
