@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PhotoLibrary
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
import fyi.kuijper.throwback.ui.components.ActionButton
import fyi.kuijper.throwback.ui.components.rememberInitialFocus
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceXl
import fyi.kuijper.throwback.ui.theme.TvScreen

@Composable
fun ConnectScreen(onConnect: () -> Unit) {
    val focus = rememberInitialFocus()
    TvScreen(contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.PhotoLibrary,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(SpaceL))
            Text("Throwback", style = MaterialTheme.typography.displayLarge)
            Spacer(Modifier.height(SpaceM))
            Text(
                "Toon de familiefoto's uit OneDrive op je TV.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(SpaceXl))
            ActionButton(
                label = "OneDrive koppelen",
                icon = Icons.Default.Link,
                onClick = onConnect,
                modifier = Modifier.focusRequester(focus),
                primary = true,
            )
        }
    }
}
