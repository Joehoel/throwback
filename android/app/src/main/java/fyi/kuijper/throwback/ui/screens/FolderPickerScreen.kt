@file:OptIn(ExperimentalTvMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package fyi.kuijper.throwback.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.Crumb
import fyi.kuijper.throwback.FolderSuggestion
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.ActionButton
import fyi.kuijper.throwback.ui.components.LoadingRow
import fyi.kuijper.throwback.ui.components.ScreenHeader
import fyi.kuijper.throwback.ui.components.WideRow
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import fyi.kuijper.throwback.ui.theme.TvScreen

@Composable
fun FolderPickerScreen(
    state: UiState.PickFolder,
    onOpen: (Crumb) -> Unit,
    onBack: () -> Unit,
    onSelect: () -> Unit,
    onSelectSuggestion: (FolderSuggestion) -> Unit,
    onCancel: () -> Unit,
) {
    val canActOnFolder = state.path.size > 1
    // Terug: omhoog in het pad, of (vanuit de show) annuleren terug naar de show.
    BackHandler(enabled = canActOnFolder || state.canCancel) {
        if (canActOnFolder) onBack() else onCancel()
    }
    TvScreen {
        Column(Modifier.fillMaxSize()) {
            ScreenHeader(
                title = "Kies de fotomap",
                subtitle = state.path.joinToString("  ›  ") { it.name },
            )
            if (canActOnFolder || state.canCancel) {
                Spacer(Modifier.height(SpaceL))
                Row(horizontalArrangement = Arrangement.spacedBy(SpaceM)) {
                    if (canActOnFolder) {
                        ActionButton("Kies deze map", Icons.Default.Check, onSelect, primary = true)
                        ActionButton("Terug", Icons.AutoMirrored.Filled.ArrowBack, onBack)
                    }
                    if (state.canCancel) {
                        ActionButton("Annuleren", Icons.Default.Close, onCancel)
                    }
                }
            }
            Spacer(Modifier.height(SpaceL))
            when {
                state.loading -> LoadingRow("Laden…")
                state.folders.isEmpty() && state.suggestions.isEmpty() -> Text(
                    "Geen submappen hier. Kies deze map of ga terug.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> FolderAndSuggestionList(state, onOpen, onSelectSuggestion)
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 4.dp, bottom = 4.dp, top = 4.dp),
    )
}

@Composable
private fun FolderAndSuggestionList(
    state: UiState.PickFolder,
    onOpen: (Crumb) -> Unit,
    onSelectSuggestion: (FolderSuggestion) -> Unit,
) {
    val first = remember { FocusRequester() }
    LaunchedEffect(state.suggestions, state.folders) { runCatching { first.requestFocus() } }
    LazyColumn(
        modifier = Modifier.focusRestorer { first },
        verticalArrangement = Arrangement.spacedBy(SpaceS),
    ) {
        if (state.suggestions.isNotEmpty()) {
            item { SectionLabel("Voorgesteld") }
            items(state.suggestions) { s ->
                val mod = if (s == state.suggestions.first()) Modifier.focusRequester(first) else Modifier
                WideRow(
                    title = s.name,
                    icon = Icons.Default.PhotoLibrary,
                    subtitle = "${s.childCount} items",
                    onClick = { onSelectSuggestion(s) },
                    modifier = mod,
                )
            }
        }
        if (state.folders.isNotEmpty()) {
            item { SectionLabel("Mappen") }
            items(state.folders) { item ->
                val isFirstFocusable = state.suggestions.isEmpty() && item == state.folders.first()
                val mod = if (isFirstFocusable) Modifier.focusRequester(first) else Modifier
                WideRow(
                    title = item.name,
                    icon = Icons.Default.Folder,
                    subtitle = "${item.childCount} items",
                    onClick = { onOpen(Crumb(item.id, item.name)) },
                    modifier = mod,
                )
            }
        }
    }
}
