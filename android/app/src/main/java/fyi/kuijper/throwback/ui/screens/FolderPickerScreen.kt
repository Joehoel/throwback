@file:OptIn(ExperimentalTvMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package fyi.kuijper.throwback.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
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
import fyi.kuijper.throwback.ui.theme.ContentMaxWidth
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

    val chooseFocus = remember { FocusRequester() }
    val listFirstFocus = remember { FocusRequester() }
    // Na elke (her)laadbeurt de focus zinnig plaatsen: in een submap meteen op "Kies deze map"
    // (de meest waarschijnlijke actie), op de hoofdmap op de eerste rij in de lijst.
    LaunchedEffect(state.path, state.loading, state.folders, state.suggestions) {
        if (state.loading) return@LaunchedEffect
        val target = if (canActOnFolder) chooseFocus else listFirstFocus
        runCatching { target.requestFocus() }
    }
    // horizontalPadding = 0: de LazyColumn vult de volle breedte en clipt daarop; de rijen worden op
    // ContentMaxWidth gecapt + gecentreerd, zodat de focus-schaal niet tegen de clip-rand afkapt.
    TvScreen(horizontalPadding = 0.dp) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            // Kop + knoppen op dezelfde contentbreedte als de rijen, zodat alles uitlijnt.
            Column(Modifier.widthIn(max = ContentMaxWidth).fillMaxWidth()) {
                ScreenHeader(
                    title = "Kies de fotomap",
                    subtitle = state.path.joinToString("  ›  ") { it.name },
                )
                if (canActOnFolder || state.canCancel) {
                    Spacer(Modifier.height(SpaceL))
                    Row(horizontalArrangement = Arrangement.spacedBy(SpaceM)) {
                        if (canActOnFolder) {
                            ActionButton(
                                "Kies deze map",
                                Icons.Default.Check,
                                onSelect,
                                modifier = Modifier.focusRequester(chooseFocus),
                                primary = true,
                            )
                            ActionButton("Terug", Icons.AutoMirrored.Filled.ArrowBack, onBack)
                        }
                        if (state.canCancel) {
                            ActionButton("Annuleren", Icons.Default.Close, onCancel)
                        }
                    }
                }
                Spacer(Modifier.height(SpaceL))
            }
            when {
                state.loading -> Column(Modifier.widthIn(max = ContentMaxWidth).fillMaxWidth()) {
                    LoadingRow("Laden…")
                }
                state.folders.isEmpty() && state.suggestions.isEmpty() -> Column(
                    Modifier.widthIn(max = ContentMaxWidth).fillMaxWidth(),
                ) {
                    Text(
                        "Geen submappen hier. Kies deze map of ga terug.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> FolderAndSuggestionList(
                    state = state,
                    onOpen = onOpen,
                    onSelectSuggestion = onSelectSuggestion,
                    firstFocus = listFirstFocus,
                    upTarget = if (canActOnFolder) chooseFocus else null,
                )
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(start = 4.dp, bottom = 4.dp, top = 4.dp),
    )
}

@Composable
private fun FolderAndSuggestionList(
    state: UiState.PickFolder,
    onOpen: (Crumb) -> Unit,
    onSelectSuggestion: (FolderSuggestion) -> Unit,
    firstFocus: FocusRequester,
    upTarget: FocusRequester?,
) {
    // De lijst vult de volle breedte en clipt daarop; de rijen worden gecapt en gecentreerd zodat
    // de focus-schaal (1.1×) ruimte heeft binnen de clip i.p.v. tegen de rand afgekapt te worden.
    // De verticale contentPadding geeft de bovenste/onderste rij dezelfde ruimte.
    val rowWidth = Modifier.widthIn(max = ContentMaxWidth).fillMaxWidth()
    // De bovenste rij stuurt "omhoog" expliciet naar de Kies-knop, anders kiest de focus-zoeker
    // geometrisch de dichtstbijzijnde (rechtse) knop i.p.v. de bedoelde linker.
    val firstRowMod = rowWidth.focusRequester(firstFocus).let {
        if (upTarget != null) it.focusProperties { up = upTarget } else it
    }
    LazyColumn(
        modifier = Modifier.fillMaxWidth().focusRestorer { firstFocus },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SpaceS),
        contentPadding = PaddingValues(vertical = SpaceS),
    ) {
        if (state.suggestions.isNotEmpty()) {
            item { SectionLabel("Voorgesteld", rowWidth) }
            items(state.suggestions) { s ->
                val mod = if (s == state.suggestions.first()) firstRowMod else rowWidth
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
            item { SectionLabel("Mappen", rowWidth) }
            items(state.folders) { item ->
                val isFirstFocusable = state.suggestions.isEmpty() && item == state.folders.first()
                val mod = if (isFirstFocusable) firstRowMod else rowWidth
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
