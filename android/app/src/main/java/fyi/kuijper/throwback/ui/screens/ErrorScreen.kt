@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.ActionButton
import fyi.kuijper.throwback.ui.components.rememberInitialFocus
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceXl
import fyi.kuijper.throwback.ui.theme.TvScreen

@Composable
fun ErrorScreen(state: UiState.Error, onRetry: () -> Unit) {
    val focus = rememberInitialFocus()
    TvScreen(contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.ErrorOutline,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.height(SpaceL))
            Text("Er ging iets mis", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(SpaceM))
            Text(
                state.message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 720.dp),
            )
            Spacer(Modifier.height(SpaceXl))
            ActionButton(
                label = "Opnieuw",
                icon = Icons.Default.Refresh,
                onClick = onRetry,
                modifier = Modifier.focusRequester(focus),
                primary = true,
            )
        }
    }
}
