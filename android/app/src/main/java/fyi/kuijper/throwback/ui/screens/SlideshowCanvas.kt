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
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.ui.components.BlurTransformation
import fyi.kuijper.throwback.ui.theme.SpaceM
import fyi.kuijper.throwback.ui.theme.SpaceS
import fyi.kuijper.throwback.ui.theme.SpaceXs
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.random.Random

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
    slideMillis: Int = 15_000,
) {
    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        // Crossfade tussen foto's; de vorige blijft zichtbaar tijdens de overgang (geen zwart).
        Crossfade(targetState = imageUrl, animationSpec = tween(1500), label = "foto") { url ->
            if (url != null) {
                val context = LocalContext.current

                // Liggende foto's (breedte ≥ hoogte) vullen het scherm (Crop, geen randen);
                // staande foto's blijven heel (Fit) op de wazige achtergrond. We kennen de
                // verhouding pas na het laden, dus we vullen alvast (Crop) en schakelen voor
                // staande foto's terug naar Fit zodra de afmetingen bekend zijn.
                var landscape by remember(url) { mutableStateOf<Boolean?>(null) }
                var boxSize by remember(url) { mutableStateOf(IntSize.Zero) }

                // Per foto één willekeurige, trage Ken Burns-beweging (in-/uitzoomen of pannen),
                // gezaaid op de URL zodat de keuze stabiel blijft over recomposities. Staande foto's
                // pannen niet horizontaal (dat oogt raar), dus we kiezen opnieuw zodra de oriëntatie
                // bekend is — voor liggende foto's geeft dezelfde seed dezelfde keuze, dus geen sprong.
                val kb = remember(url, landscape) {
                    randomKenBurns(Random(url.hashCode()), allowHorizontalPan = landscape != false)
                }
                val progress = remember(url, landscape) { Animatable(0f) }
                LaunchedEffect(url, landscape) {
                    progress.animateTo(1f, tween(durationMillis = slideMillis, easing = LinearEasing))
                }

                Box(modifier = Modifier.fillMaxSize().onSizeChanged { boxSize = it }) {
                    // Wazige, schermvullende achtergrond — vult letterbox-randen bij staande foto's.
                    // De blur zit in de bitmap (BlurTransformation) i.p.v. Modifier.blur, zodat het
                    // ook op Android < 12 (o.a. de KPN-box) werkt.
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(url)
                            .transformations(BlurTransformation())
                            .build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    // Scherpe foto erbovenop, met de Ken Burns-transformatie.
                    AsyncImage(
                        model = url,
                        contentDescription = null,
                        contentScale = if (landscape == false) ContentScale.Fit else ContentScale.Crop,
                        onSuccess = { landscape = it.result.image.width >= it.result.image.height },
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                val p = progress.value
                                // Staande foto's starten wat verder ingezoomd zodat ze meer van
                                // het scherm vullen i.p.v. klein tussen de wazige randen te staan.
                                val bump = if (landscape == false) 0.18f else 0f
                                val s = lerp(kb.scaleStart, kb.scaleEnd, p) + bump
                                scaleX = s
                                scaleY = s
                                // Pan binnen de overscan (s - 1), zodat de randen nooit zwart worden.
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
 * Eén Ken Burns-beweging voor een dia: een schaal die van [scaleStart] naar [scaleEnd] loopt en een
 * pan-fractie (−1..1) van de beschikbare overscan, per as. Schaal 1.0 = precies passend; >1 geeft
 * ruimte om te pannen zonder zwarte randen.
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
 * Kies willekeurig één trage beweging: langzaam in-/uitzoomen of pannen. Heel subtiel (~10–16%
 * beweging over de hele dia), in de stijl van de Google Foto's-screensaver. Horizontaal pannen
 * doen we alleen als [allowHorizontalPan] aanstaat (uit voor staande foto's, waar het raar oogt).
 */
private fun randomKenBurns(r: Random, allowHorizontalPan: Boolean): KenBurns {
    val z = 0.10f + r.nextFloat() * 0.06f // zoombereik 0.10–0.16
    return when (r.nextInt(if (allowHorizontalPan) 4 else 3)) {
        0 -> KenBurns(1.0f, 1.0f + z, 0f, 0f, 0f, 0f) // langzaam inzoomen
        1 -> KenBurns(1.0f + z, 1.0f, 0f, 0f, 0f, 0f) // langzaam uitzoomen
        2 -> { // verticaal pannen, vaste schaal
            val dir = if (r.nextBoolean()) 1f else -1f
            KenBurns(1.0f + z, 1.0f + z, 0f, 0f, -dir * 0.5f, dir * 0.5f)
        }
        else -> { // horizontaal pannen, vaste schaal (alleen liggende foto's)
            val dir = if (r.nextBoolean()) 1f else -1f
            KenBurns(1.0f + z, 1.0f + z, -dir * 0.6f, dir * 0.6f, 0f, 0f)
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
        Column(verticalArrangement = Arrangement.spacedBy(SpaceXs)) {
            // Beschrijving groot bovenaan, dan de datum, dan (indien aanwezig) de locatie.
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
