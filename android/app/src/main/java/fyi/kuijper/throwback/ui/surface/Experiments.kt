package fyi.kuijper.throwback.ui.surface

/**
 * EXPLORATION (branch explore/surfaceview-4k). Compile-time switch between the production Compose
 * renderer (`SlideshowCanvas`) and the experimental native-resolution [Surface4kCanvas]. Flip to
 * compare on-device; never merge as `true` without the per-device 4K confirmation.
 */
object Experiments {
    const val USE_SURFACE_RENDERER = false
}
