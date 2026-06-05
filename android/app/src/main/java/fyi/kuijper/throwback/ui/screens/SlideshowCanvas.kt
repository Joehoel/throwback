@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Place
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.transformations
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import fyi.kuijper.throwback.core.AppLocale
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.ui.components.BlurTransformation
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import fyi.kuijper.throwback.ui.theme.SpaceXs
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.random.Random

/** Crossfade lengths: a slow dissolve for the automatic slide change, a quick one for manual stepping. */
private const val AUTO_CROSSFADE_MS = 1500
private const val MANUAL_CROSSFADE_MS = 200

/**
 * Pure photo display, no input handling. Shared by the in-app show and the screensaver (DreamService).
 */
@Composable
fun SlideshowCanvas(
    imageUrl: String?,
    photo: PhotoRow?,
    captionEnabled: Boolean,
    offlineHint: Boolean,
    paused: Boolean,
    modifier: Modifier = Modifier,
    slideMillis: Int = 15_000,
    userInitiated: Boolean = false,
) {
    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        // The previous photo stays visible during the crossfade, so there is no black flash. A manual
        // next/previous crossfades fast (snappy stepping); the automatic slide change stays a slow dissolve.
        val fadeMs = if (userInitiated) MANUAL_CROSSFADE_MS else AUTO_CROSSFADE_MS
        Crossfade(targetState = imageUrl, animationSpec = tween(fadeMs), label = "foto") { url ->
            if (url != null) {
                val context = LocalContext.current

                // Landscape photos fill the screen (Crop, no borders); portrait photos stay whole
                // (Fit) over the blurred background. The aspect ratio is unknown until load, so we
                // default to Crop and switch portrait photos to Fit once their size is known.
                var landscape by remember(url) { mutableStateOf<Boolean?>(null) }
                var boxSize by remember(url) { mutableStateOf(IntSize.Zero) }

                // One random slow Ken Burns move per photo, seeded on the URL so the choice stays
                // stable across recompositions. Portrait photos never pan horizontally (looks odd),
                // so we re-pick once orientation is known; landscape photos keep the same seeded
                // choice, so there is no visible jump.
                val kb = remember(url, landscape) {
                    randomKenBurns(Random(url.hashCode()), allowHorizontalPan = landscape != false)
                }
                val progress = remember(url, landscape) { Animatable(0f) }
                LaunchedEffect(url, landscape) {
                    progress.animateTo(1f, tween(durationMillis = slideMillis, easing = LinearEasing))
                }

                Box(modifier = Modifier.fillMaxSize().onSizeChanged { boxSize = it }) {
                    // Blurred full-screen background fills the letterbox borders of portrait photos.
                    // The blur is baked into the bitmap (BlurTransformation) instead of Modifier.blur
                    // so it also works on Android < 12.
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(url)
                            .transformations(BlurTransformation())
                            .build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    // Sharp photo on top, with the Ken Burns transform.
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = if (landscape == false) ContentScale.Fit else ContentScale.Crop,
                        onSuccess = { landscape = it.result.image.width >= it.result.image.height },
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                val p = progress.value
                                // Portrait photos start zoomed in further so they fill more of the
                                // screen instead of sitting small between the blurred borders.
                                val bump = if (landscape == false) 0.18f else 0f
                                val s = lerp(kb.scaleStart, kb.scaleEnd, p) + bump
                                scaleX = s
                                scaleY = s
                                // Pan within the overscan (s - 1) so the edges never go black.
                                val overscanX = (s - 1f) * boxSize.width / 2f
                                val overscanY = (s - 1f) * boxSize.height / 2f
                                translationX = lerp(kb.panXStart, kb.panXEnd, p) * overscanX
                                translationY = lerp(kb.panYStart, kb.panYEnd, p) * overscanY
                            },
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

/**
 * One Ken Burns move for a slide: a scale from [scaleStart] to [scaleEnd] plus a per-axis pan
 * fraction (−1..1) of the available overscan. Scale 1.0 = exact fit; >1 leaves room to pan without
 * black borders.
 */
private data class KenBurns(
    val scaleStart: Float,
    val scaleEnd: Float,
    val panXStart: Float,
    val panXEnd: Float,
    val panYStart: Float,
    val panYEnd: Float,
)

/**
 * Pick one random slow move: zoom in/out or pan. Kept very subtle (~10–16% over a full slide).
 * Horizontal pan only happens when [allowHorizontalPan] is set (off for portrait, where it looks odd).
 */
private fun randomKenBurns(r: Random, allowHorizontalPan: Boolean): KenBurns {
    val z = 0.10f + r.nextFloat() * 0.06f
    return when (r.nextInt(if (allowHorizontalPan) 4 else 3)) {
        0 -> KenBurns(1.0f, 1.0f + z, 0f, 0f, 0f, 0f)
        1 -> KenBurns(1.0f + z, 1.0f, 0f, 0f, 0f, 0f)
        2 -> {
            val dir = if (r.nextBoolean()) 1f else -1f
            KenBurns(1.0f + z, 1.0f + z, 0f, 0f, -dir * 0.5f, dir * 0.5f)
        }
        else -> { // horizontal pan — landscape only
            val dir = if (r.nextBoolean()) 1f else -1f
            KenBurns(1.0f + z, 1.0f + z, -dir * 0.6f, dir * 0.6f, 0f, 0f)
        }
    }
}

@Composable
internal fun Caption(p: PhotoRow, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f))))
            .padding(start = 48.dp, end = 48.dp, bottom = 32.dp, top = 64.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(SpaceXs)) {
            p.description?.let {
                Text(it, style = MaterialTheme.typography.titleLarge, color = Color.White)
            }
            takenDateLabel(p.taken, p.year)?.let {
                Text(it, style = MaterialTheme.typography.bodyLarge, color = Color.White.copy(alpha = 0.85f))
            }
            p.place?.let { place ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Place,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = Color.White.copy(alpha = 0.7f),
                    )
                    Spacer(Modifier.width(SpaceXs))
                    Text(place, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.7f))
                }
            }
        }
    }
}

private val dutchDate = DateTimeFormatter.ofPattern("d MMMM yyyy", AppLocale)

/**
 * Exact capture date from [PhotoRow.taken] (ISO like "2009-08-15T…") in NL format. Uses only the
 * date part (first 10 chars) so a timezone can't shift the day. Falls back to the year when a photo
 * has no date metadata.
 */
private fun takenDateLabel(taken: String?, year: Int?): String? {
    val date = taken?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return date?.format(dutchDate) ?: year?.toString()
}

@Composable
internal fun OfflineHint(modifier: Modifier = Modifier) {
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
