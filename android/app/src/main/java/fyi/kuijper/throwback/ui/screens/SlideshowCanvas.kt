@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.transformations
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.ui.components.BlurTransformation
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Puur de foto-weergave (geen input/bediening): vervaagde achtergrond + scherpe foto +
 * subtiel bijschrift + offline-hint. Gedeeld door de app-show en de screensaver (DreamService).
 */
@Composable
fun SlideshowCanvas(
    imageUrl: String?,
    photo: PhotoRow?,
    captionEnabled: Boolean,
    offlineHint: Boolean,
    paused: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        // Crossfade tussen foto's; de vorige blijft zichtbaar tijdens de overgang (geen zwart).
        Crossfade(targetState = imageUrl, animationSpec = tween(1500), label = "foto") { url ->
            if (url != null) {
                val context = LocalContext.current
                Box(modifier = Modifier.fillMaxSize()) {
                    // Wazige, schermvullende achtergrond — vult letterbox-randen. De blur zit in de
                    // bitmap (BlurTransformation) i.p.v. Modifier.blur, zodat het ook op Android < 12
                    // (o.a. de KPN-box) werkt.
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(url)
                            .transformations(BlurTransformation())
                            .build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    // Scherpe, volledige foto erbovenop.
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }

        if (captionEnabled && photo != null) {
            Caption(photo, modifier = Modifier.align(Alignment.BottomStart))
        }
        if (offlineHint) {
            OfflineHint(modifier = Modifier.align(Alignment.TopEnd))
        }
        if (paused) {
            Text(
                "⏸ Gepauzeerd",
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                modifier = Modifier.align(Alignment.TopStart).padding(32.dp),
            )
        }
    }
}

@Composable
private fun Caption(p: PhotoRow, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f))))
            .padding(start = 48.dp, end = 48.dp, bottom = 32.dp, top = 64.dp),
    ) {
        Column {
            takenDateLabel(p.taken, p.year)?.let {
                Text(it, style = MaterialTheme.typography.titleMedium, color = Color.White)
            }
            p.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            }
        }
    }
}

private val dutchDate = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale("nl", "NL"))

/**
 * Exacte opnamedatum uit de fotometadata ([PhotoRow.taken], ISO zoals "2009-08-15T…") in NL-formaat,
 * bijv. "15 augustus 2009". We nemen alleen het datumdeel (eerste 10 tekens) zodat een tijdzone de
 * dag niet kan verschuiven. Valt terug op het jaar als een foto geen datum-metadata heeft.
 */
private fun takenDateLabel(taken: String?, year: Int?): String? {
    val date = taken?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return date?.format(dutchDate) ?: year?.toString()
}

@Composable
private fun OfflineHint(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .padding(32.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = SpaceM, vertical = SpaceS),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.CloudOff, contentDescription = null, modifier = Modifier.size(20.dp), tint = Color.White)
        Spacer(Modifier.width(SpaceS))
        Text("Geen verbinding", style = MaterialTheme.typography.bodyMedium, color = Color.White)
    }
}
