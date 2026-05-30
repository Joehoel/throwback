package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/**
 * First frame when already connected and loading the index. Deliberately a quiet black box (no
 * spinner) so nothing flashes on the usual fast start.
 */
@Composable
fun LoadingScreen() {
    Box(Modifier.fillMaxSize().background(Color.Black))
}
