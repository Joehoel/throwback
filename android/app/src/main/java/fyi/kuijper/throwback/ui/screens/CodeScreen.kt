@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.UiState
import fyi.kuijper.throwback.ui.components.LoadingRow
import fyi.kuijper.throwback.ui.components.ScreenHeader
import fyi.kuijper.throwback.ui.components.rememberQrBitmap
import fyi.kuijper.throwback.ui.theme.SpaceL
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import fyi.kuijper.throwback.ui.theme.SpaceXl
import fyi.kuijper.throwback.ui.theme.TvScreen

@Composable
fun CodeScreen(state: UiState.ShowCode) {
    val qr = rememberQrBitmap(state.code.verificationUri)
    TvScreen(contentAlignment = Alignment.Center) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SpaceXl),
        ) {
            // QR-code: wit kader zodat hij ook op de donkere achtergrond scanbaar blijft.
            if (qr != null) {
                Image(
                    bitmap = qr,
                    contentDescription = "QR-code naar ${state.code.verificationUri}",
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.White)
                        .padding(16.dp)
                        .size(260.dp),
                )
            }
            Column {
                ScreenHeader(
                    title = "Koppel je OneDrive",
                    subtitle = "Scan de QR-code met je telefoon",
                )
                Spacer(Modifier.height(SpaceL))
                Text(
                    "of ga op je telefoon naar:",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    state.code.verificationUri,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(SpaceM))
                Text(
                    "en voer deze code in:",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(SpaceS))
                Text(
                    state.code.userCode,
                    style = MaterialTheme.typography.displayLarge,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = SpaceL, vertical = SpaceM),
                )
                Spacer(Modifier.height(SpaceXl))
                LoadingRow("Wachten op inloggen…")
            }
        }
    }
}
