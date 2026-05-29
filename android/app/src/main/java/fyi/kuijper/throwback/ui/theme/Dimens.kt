package fyi.kuijper.throwback.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme

// 10-foot UI / overscan: alle bedienbare content binnen de veilige marge van ~5%.
val SafeH = 48.dp
val SafeV = 27.dp

// Standaard spacing-stappen voor een rustige, consistente layout.
val SpaceXs = 4.dp
val SpaceS = 8.dp
val SpaceM = 16.dp
val SpaceL = 24.dp
val SpaceXl = 40.dp

/**
 * Eén gedeelde schermwrapper: vult het scherm, zet de thema-achtergrond en past de
 * veilige overscan-marge toe. Vervangt het oude `Centered`-patroon zodat elk scherm
 * dezelfde marges deelt.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvScreen(
    modifier: Modifier = Modifier,
    contentAlignment: Alignment = Alignment.TopStart,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = SafeH, vertical = SafeV),
        contentAlignment = contentAlignment,
        content = content,
    )
}
