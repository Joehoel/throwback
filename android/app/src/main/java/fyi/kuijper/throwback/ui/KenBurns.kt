package fyi.kuijper.throwback.ui

import kotlin.random.Random

/**
 * One slow Ken Burns move for a slide: a scale from [scaleStart] to [scaleEnd] plus a per-axis pan
 * fraction (−1..1) of the available overscan. Scale 1.0 = exact fit; >1 leaves room to pan without
 * exposing black edges. Shared by the Compose renderer ([fyi.kuijper.throwback.ui.screens.SlideshowCanvas])
 * and the SurfaceView renderer ([fyi.kuijper.throwback.ui.surface.PhotoSurfaceView]) so both keep the same feel.
 */
data class KenBurns(
    val scaleStart: Float,
    val scaleEnd: Float,
    val panXStart: Float,
    val panXEnd: Float,
    val panYStart: Float,
    val panYEnd: Float,
)

/**
 * Pick one subtle random move (zoom in/out or pan, ~10–16% over a full slide). Horizontal pan only
 * happens when [allowHorizontalPan] is set (off for portrait, where it looks odd).
 */
fun randomKenBurns(r: Random, allowHorizontalPan: Boolean): KenBurns {
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
