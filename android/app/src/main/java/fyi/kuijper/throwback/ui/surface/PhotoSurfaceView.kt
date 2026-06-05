package fyi.kuijper.throwback.ui.surface

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.AttributeSet
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * EXPLORATION (branch explore/surfaceview-4k). Renders the slideshow into a [SurfaceView] instead of a
 * Compose `AsyncImage`, so it can draw at the display's *native* resolution on Android TV boxes whose
 * UI layer is composited at 1080p (Chromecast/Google TV Streamer class). A SurfaceView gets its own
 * SurfaceFlinger layer, composited at the display mode resolution rather than the 1080p UI layer — see
 * https://developer.android.com/media/media3/ui/surface. We request that buffer with
 * [SurfaceHolder.setFixedSize] sized to [Display.Mode.physicalWidth]/`physicalHeight` (= Media3's
 * `Util.getCurrentDisplayModeSize`).
 *
 * The split only exists where `mode.physicalWidth` > `Display.getSize` (the Google TV Streamer: 3840 vs
 * 1920). On the KPN box the OS-level display mode is *itself* 1080p (the 2160p HDMI upscale happens in
 * the vendor scaler, below the framework), so there's no gap to exploit — and an emulator shows them
 * equal too. We log all three sizes ([logSizes]) so the real win can be confirmed per device.
 *
 * Drawing runs on its own thread via [SurfaceHolder.lockHardwareCanvas] (GPU-backed, API 26+). One
 * slide at a time, with a Ken Burns pan/zoom, a crossfade from the previous slide, and a blurred
 * cover background behind portrait photos (which are drawn whole).
 */
class PhotoSurfaceView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) :
    SurfaceView(context, attrs), SurfaceHolder.Callback {

    /** A loaded photo ready to draw: the sharp bitmap, an optional pre-blurred cover, orientation, move. */
    class Slide(
        val sharp: Bitmap,
        val blurred: Bitmap?,
        val landscape: Boolean,
        val kb: KenBurns,
    )

    // Drawn state — written from the UI thread (present/setPaused), read from the render thread. Volatile
    // refs are enough: each is an immutable handoff, and a torn frame would only be one stale draw.
    @Volatile private var cur: Slide? = null
    @Volatile private var prev: Slide? = null
    @Volatile private var paused = false
    @Volatile private var slideMillis = 15_000

    // Per-slide animation clocks in ms, advanced by frame delta (so pause just stops advancing them).
    private var slideClock = 0L          // drives the current slide's Ken Burns progress
    private var fadeClock = 0L           // drives the crossfade-in of the current slide
    private var prevFrozenProgress = 1f  // the outgoing slide is held at the progress it had at swap
    private var lastFrameUptime = 0L

    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val matrix = Matrix()

    private var renderThread: HandlerThread? = null
    private var renderHandler: Handler? = null
    @Volatile private var rendering = false
    private var bufferW = 0
    private var bufferH = 0

    init {
        holder.addCallback(this)
        // Behind the window (default), so Compose overlays (caption, hints) draw on top in the UI layer.
        setZOrderMediaOverlay(false)
    }

    /** Hand a freshly loaded slide to the renderer; starts its crossfade in and Ken Burns from zero. */
    fun present(slide: Slide) {
        synchronized(this) {
            prevFrozenProgress = progressOf(slideClock)
            prev = cur
            cur = slide
            slideClock = 0L
            fadeClock = 0L
        }
    }

    fun setPaused(value: Boolean) { paused = value }

    fun setSlideMillis(value: Int) { slideMillis = value }

    // --- SurfaceHolder.Callback ------------------------------------------------------------------

    override fun surfaceCreated(h: SurfaceHolder) {
        val (nw, nh) = nativeModeSize()
        logSizes(nw, nh)
        // Ask SurfaceFlinger for a native-resolution buffer regardless of this view's on-screen box.
        if (nw > 0 && nh > 0) h.setFixedSize(nw, nh) // -> surfaceChanged fires again with the new size
        startRenderLoop()
    }

    override fun surfaceChanged(h: SurfaceHolder, format: Int, width: Int, height: Int) {
        bufferW = width
        bufferH = height
        Log.i(TAG, "surfaceChanged: drawing buffer = ${width}x$height (this is what we actually render into)")
    }

    override fun surfaceDestroyed(h: SurfaceHolder) {
        stopRenderLoop()
    }

    // --- render loop -----------------------------------------------------------------------------

    private fun startRenderLoop() {
        if (rendering) return
        rendering = true
        lastFrameUptime = SystemClock.uptimeMillis()
        val thread = HandlerThread("photo-surface-render").also { it.start() }
        val handler = Handler(thread.looper)
        renderThread = thread
        renderHandler = handler
        handler.post(object : Runnable {
            override fun run() {
                if (!rendering) return
                drawFrame()
                handler.postDelayed(this, FRAME_MS)
            }
        })
    }

    private fun stopRenderLoop() {
        rendering = false
        renderThread?.quitSafely()
        renderThread = null
        renderHandler = null
    }

    private fun drawFrame() {
        val now = SystemClock.uptimeMillis()
        val dt = now - lastFrameUptime
        lastFrameUptime = now
        // The crossfade must always finish, even while paused: navigating (next/prev) while the show is
        // paused calls present() and resets fadeClock to 0, so gating the fade on !paused would leave the
        // new photo stuck at alpha 0 under the old one — i.e. navigation does nothing. Only the Ken Burns
        // pan/zoom (slideClock) honours pause; the Compose renderer likewise keeps animating regardless.
        fadeClock += dt
        if (!paused) slideClock += dt

        val canvas = try {
            holder.lockHardwareCanvas()
        } catch (e: IllegalStateException) {
            null
        } ?: return
        try {
            canvas.drawColor(Color.BLACK)
            val current = cur ?: return
            val fade = min(1f, fadeClock.toFloat() / CROSSFADE_MS)
            // Outgoing slide stays visible underneath until the new one has fully faded in (no black flash).
            if (fade < 1f) prev?.let { drawSlide(canvas, it, prevFrozenProgress, alpha = 1f) }
            drawSlide(canvas, current, progressOf(slideClock), alpha = fade)
        } finally {
            holder.unlockCanvasAndPost(canvas)
        }
    }

    private fun progressOf(clock: Long): Float =
        min(1f, clock.toFloat() / slideMillis.coerceAtLeast(1))

    /** Draw one slide at [progress] (0..1 Ken Burns) and [alpha], cover-filling or fit+blur per orientation. */
    private fun drawSlide(canvas: Canvas, slide: Slide, progress: Float, alpha: Float) {
        val sw = bufferW.toFloat()
        val sh = bufferH.toFloat()
        if (sw <= 0 || sh <= 0) return
        val kb = slide.kb
        val scale = lerp(kb.scaleStart, kb.scaleEnd, progress)
        paint.alpha = (alpha * 255f).toInt().coerceIn(0, 255)

        if (slide.landscape) {
            // Cover-fill the screen, then pan within the overscan the zoom created.
            drawCover(canvas, slide.sharp, sw, sh, scale, panX = lerp(kb.panXStart, kb.panXEnd, progress),
                panY = lerp(kb.panYStart, kb.panYEnd, progress))
        } else {
            // Portrait: blurred cover behind, the whole photo fit on top (bumped to fill more height).
            slide.blurred?.let { drawCover(canvas, it, sw, sh, scale = 1.08f, panX = 0f, panY = 0f) }
            drawFit(canvas, slide.sharp, sw, sh, scale = scale + PORTRAIT_BUMP,
                panY = lerp(kb.panYStart, kb.panYEnd, progress))
        }
    }

    private fun drawCover(c: Canvas, bmp: Bitmap, sw: Float, sh: Float, scale: Float, panX: Float, panY: Float) {
        val bw = bmp.width.toFloat()
        val bh = bmp.height.toFloat()
        val s = max(sw / bw, sh / bh) * scale
        val drawW = bw * s
        val drawH = bh * s
        val left = (sw - drawW) / 2f + panX * (drawW - sw) / 2f
        val top = (sh - drawH) / 2f + panY * (drawH - sh) / 2f
        matrix.setScale(s, s)
        matrix.postTranslate(left, top)
        c.drawBitmap(bmp, matrix, paint)
    }

    private fun drawFit(c: Canvas, bmp: Bitmap, sw: Float, sh: Float, scale: Float, panY: Float) {
        val bw = bmp.width.toFloat()
        val bh = bmp.height.toFloat()
        val s = min(sw / bw, sh / bh) * scale
        val drawW = bw * s
        val drawH = bh * s
        val left = (sw - drawW) / 2f
        // Only pan within whatever vertical overscan the scale produced (0 if the photo fits within height).
        val top = (sh - drawH) / 2f + panY * max(0f, drawH - sh) / 2f
        matrix.setScale(s, s)
        matrix.postTranslate(left, top)
        c.drawBitmap(bmp, matrix, paint)
    }

    // --- sizing / diagnostics --------------------------------------------------------------------

    /** The display's full native mode size (= what a SurfaceView buffer can reach), or (0,0) if unknown. */
    private fun nativeModeSize(): Pair<Int, Int> {
        val mode = display?.mode ?: return 0 to 0
        return mode.physicalWidth to mode.physicalHeight
    }

    private fun logSizes(nativeW: Int, nativeH: Int) {
        val ui = android.graphics.Point().also { @Suppress("DEPRECATION") display?.getSize(it) }
        val gap = if (nativeW > ui.x) "  <-- UI is downscaled; SurfaceView CAN reach native" else
            "  (no gap: UI already == native, SurfaceView gains nothing here)"
        Log.i(TAG, "display sizes  ui=${ui.x}x${ui.y}  nativeMode=${nativeW}x$nativeH$gap")
    }

    private companion object {
        const val TAG = "PhotoSurface4K"
        const val FRAME_MS = 16L
        const val CROSSFADE_MS = 1500f
        const val PORTRAIT_BUMP = 0.18f
    }
}

/**
 * One slow Ken Burns move for a slide: scale [scaleStart]→[scaleEnd] plus a per-axis pan fraction
 * (−1..1) of the overscan the zoom creates. Ported from SlideshowCanvas so the SurfaceView path keeps
 * the same feel. Scale 1.0 = exact fit; >1 leaves room to pan without exposing black edges.
 */
class KenBurns(
    val scaleStart: Float,
    val scaleEnd: Float,
    val panXStart: Float,
    val panXEnd: Float,
    val panYStart: Float,
    val panYEnd: Float,
) {
    companion object {
        /** Pick one subtle random move (~10–16% over the slide); horizontal pan only when allowed. */
        fun random(r: Random, allowHorizontalPan: Boolean): KenBurns {
            val z = 0.10f + r.nextFloat() * 0.06f
            return when (r.nextInt(if (allowHorizontalPan) 4 else 3)) {
                0 -> KenBurns(1.0f, 1.0f + z, 0f, 0f, 0f, 0f)
                1 -> KenBurns(1.0f + z, 1.0f, 0f, 0f, 0f, 0f)
                2 -> {
                    val dir = if (r.nextBoolean()) 1f else -1f
                    KenBurns(1.0f + z, 1.0f + z, 0f, 0f, -dir * 0.5f, dir * 0.5f)
                }
                else -> {
                    val dir = if (r.nextBoolean()) 1f else -1f
                    KenBurns(1.0f + z, 1.0f + z, -dir * 0.6f, dir * 0.6f, 0f, 0f)
                }
            }
        }
    }
}

private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
