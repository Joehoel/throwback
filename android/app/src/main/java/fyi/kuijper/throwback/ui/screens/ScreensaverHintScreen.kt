@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Tv
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

/** Eenmalige hint na de setup: stel Throwback in als systeem-screensaver. */
@Composable
fun ScreensaverHintScreen(onOpenSettings: () -> Unit, onLater: () -> Unit) {
    val focus = rememberInitialFocus()
    BackHandler(enabled = true) { onLater() }
    TvScreen(contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.widthIn(max = 820.dp),
        ) {
            Icon(
                Icons.Default.Tv,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(SpaceL))
            Text("Throwback als screensaver?", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(SpaceM))
            Text(
                "Stel Throwback in als screensaver, dan verschijnen je foto's vanzelf wanneer de TV " +
                    "een tijdje niets doet. Je kunt dit ook later via Instellingen doen.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(SpaceXl))
            Row(horizontalArrangement = Arrangement.spacedBy(SpaceM)) {
                ActionButton(
                    label = "Open TV-instellingen",
                    icon = Icons.Default.Tv,
                    onClick = onOpenSettings,
                    modifier = Modifier.focusRequester(focus),
                    primary = true,
                )
                ActionButton("Later", Icons.Default.Close, onLater)
            }
        }
    }
}
