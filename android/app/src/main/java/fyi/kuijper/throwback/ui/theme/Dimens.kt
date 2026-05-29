package fyi.kuijper.throwback.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme

// 10-foot UI / overscan: alle bedienbare content binnen de veilige marge van ~5%.
val SafeH = 48.dp
val SafeV = 27.dp

// Max breedte van een leesbaar contentblok (lijsten/instellingen). Bewust smaller dan de veilige
// zone zodat een gefocuste rij die opschaalt (TV-focus 1.1×) ruimte houdt en niet tegen de
// clip-rand van een scroll-/lazy-container valt — die clipt namelijk op zijn eigen breedte.
val ContentMaxWidth = 820.dp

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
    horizontalPadding: Dp = SafeH,
    content: @Composable BoxScope.() -> Unit,
) {
    // Scrollende schermen geven horizontalPadding = 0 mee: hun scroll-/lazy-container vult dan de
    // volle breedte en clipt daarop, terwijl de inhoud zelf gecapt + gecentreerd wordt. Zo kan een
    // gefocuste rij opschalen in de overscan-marge i.p.v. tegen de clip-rand afgekapt te worden.
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = horizontalPadding, vertical = SafeV),
        contentAlignment = contentAlignment,
        content = content,
    )
}
