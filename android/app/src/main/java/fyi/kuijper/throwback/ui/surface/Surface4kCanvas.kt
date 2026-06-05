@file:OptIn(ExperimentalTvMaterial3Api::class)

package fyi.kuijper.throwback.ui.surface

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.size.Size
import coil3.toBitmap
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.ui.components.BlurTransformation
import fyi.kuijper.throwback.ui.screens.Caption
import fyi.kuijper.throwback.ui.screens.OfflineHint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.random.Random

/**
 * EXPLORATION (branch explore/surfaceview-4k). Drop-in alternative to `SlideshowCanvas` that renders
 * the photo through a [PhotoSurfaceView] — a native-resolution SurfaceView layer — instead of a Compose
 * `AsyncImage`. Same inputs/behaviour from the engine's point of view. The photo lives in the 4K-capable
 * surface layer; the caption and hints stay Compose overlays in the (1080p) UI layer on top, which is
 * exactly where we want them (text needs no extra resolution, and we avoid re-implementing it).
 *
 * Coil still decodes the bitmap (as a software bitmap, so [BlurTransformation] can read its pixels and
 * the hardware canvas can still upload it). We build the blurred portrait background here, once per
 * photo, rather than per frame.
 */
@Composable
fun Surface4kCanvas(
    imageUrl: String?,
    photo: PhotoRow?,
    captionEnabled: Boolean,
    offlineHint: Boolean,
    paused: Boolean,
    modifier: Modifier = Modifier,
    slideMillis: Int = 15_000,
) {
    val context = LocalContext.current
    val view = remember { PhotoSurfaceView(context) }
    // Decoding is async, so a slower earlier load could finish after a newer one: the gate drops any
    // present that is no longer the most-recently-requested photo (keeps next/previous deterministic).
    // The cache keeps the last few decoded slides so stepping back and forth is instant, not re-decoded.
    val gate = remember { LatestSlideGate() }
    val cache = remember { SlideCache<PhotoSurfaceView.Slide>(SLIDE_CACHE_SIZE) }

    LaunchedEffect(paused) { view.setPaused(paused) }
    LaunchedEffect(slideMillis) { view.setSlideMillis(slideMillis) }
    LaunchedEffect(imageUrl) {
        val url = imageUrl ?: return@LaunchedEffect
        val token = gate.issue()
        val slide = cache.get(url)
            ?: withContext(Dispatchers.Default) { loadSlide(context, url) }?.also { cache.put(url, it) }
        if (slide != null && gate.isLatest(token)) view.present(slide)
    }

    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { view }, modifier = Modifier.fillMaxSize())

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

/** How many decoded slides to keep ready — covers a few steps of back/forward without re-decoding. */
private const val SLIDE_CACHE_SIZE = 6

/** Decode [url] to a software bitmap, build the portrait blur, and seed the Ken Burns move from the URL. */
private suspend fun loadSlide(context: Context, url: String): PhotoSurfaceView.Slide? {
    val loader = SingletonImageLoader.get(context)
    val request = ImageRequest.Builder(context)
        .data(url)
        .allowHardware(false) // need CPU pixel access for the blur; also lets drawBitmap re-upload freely
        .build()
    val sharp = (loader.execute(request) as? SuccessResult)?.image?.toBitmap() ?: return null
    val landscape = sharp.width >= sharp.height
    val blurred = if (landscape) null else
        runCatching { BlurTransformation().transform(sharp, Size.ORIGINAL) }.getOrNull()
    val kb = KenBurns.random(Random(url.hashCode()), allowHorizontalPan = landscape)
    return PhotoSurfaceView.Slide(sharp, blurred, landscape, kb)
}
