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

// 10-foot UI / overscan: keep all interactive content within the ~5% safe margin.
val SafeH = 48.dp
val SafeV = 27.dp

// Max width of a readable content block (lists/settings). Deliberately narrower than the safe zone
// so a focused row that scales up (TV focus 1.1×) keeps room and doesn't hit the clip edge of a
// scroll/lazy container, which clips at its own width.
val ContentMaxWidth = 820.dp

val SpaceXs = 4.dp
val SpaceS = 8.dp
val SpaceM = 16.dp
val SpaceL = 24.dp
val SpaceXl = 40.dp

/**
 * Shared screen wrapper: fills the screen, sets the theme background, and applies the safe overscan
 * margin so every screen shares the same margins.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvScreen(
    modifier: Modifier = Modifier,
    contentAlignment: Alignment = Alignment.TopStart,
    horizontalPadding: Dp = SafeH,
    content: @Composable BoxScope.() -> Unit,
) {
    // Scrolling screens pass horizontalPadding = 0: their scroll/lazy container then fills the full
    // width and clips there, while the content is capped and centered. This lets a focused row scale
    // up into the overscan margin instead of being cut off at the clip edge.
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = horizontalPadding, vertical = SafeV),
        contentAlignment = contentAlignment,
        content = content,
    )
}
