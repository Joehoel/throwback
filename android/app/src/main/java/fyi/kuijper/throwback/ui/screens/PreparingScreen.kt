@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.TvSpinner
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import fyi.kuijper.throwback.ui.theme.TvScreen

/** Brief prepare state right after picking a folder; auto-advances to the show once photos arrive. */
@Composable
fun PreparingScreen(state: UiState.Preparing) {
    TvScreen(contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            TvSpinner(size = 56.dp)
            Spacer(Modifier.height(SpaceL))
            Text("Foto's worden opgehaald…", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(SpaceM))
            Text(
                "Map: ${state.folderName}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(SpaceS))
            Text("${state.count} verwerkt", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(SpaceL))
            Text(
                "Zodra de eerste foto's binnen zijn, start de diashow vanzelf.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}
