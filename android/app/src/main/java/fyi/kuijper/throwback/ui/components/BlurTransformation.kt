package fyi.kuijper.throwback.ui.components

import android.graphics.Bitmap
import coil3.size.Size
import coil3.transform.Transformation

/**
 * Blurs an image on the CPU via the bitmap itself so it works on every Android level — `Modifier.blur`
 * only does anything from API 31 (Android 12). We downscale heavily and run a separable box-blur
 * (2× ≈ Gaussian); Coil scales the result back up full-screen, which adds extra smoothing.
 */
class BlurTransformation(
    private val radius: Int = 3,
    private val sampleWidth: Int = 280,
) : Transformation() {

    override val cacheKey: String = "blur:$radius:$sampleWidth"

    override suspend fun transform(input: Bitmap, size: Size): Bitmap {
        val w = sampleWidth.coerceAtMost(input.width).coerceAtLeast(1)
        val h = (input.height.toFloat() * w / input.width).toInt().coerceAtLeast(1)
        val small = Bitmap.createScaledBitmap(input, w, h, true)

        val pixels = IntArray(w * h)
        small.getPixels(pixels, 0, w, 0, 0, w, h)
        boxBlur(pixels, w, h, radius)
        boxBlur(pixels, w, h, radius)

        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        out.setPixels(pixels, 0, w, 0, 0, w, h)
        return out
    }

    /** Separable box-blur (horizontal then vertical) over an [r]-window per channel. */
    private fun boxBlur(p: IntArray, w: Int, h: Int, r: Int) {
        val tmp = IntArray(p.size)
        for (y in 0 until h) {
            val row = y * w
            for (x in 0 until w) {
                var a = 0; var rr = 0; var g = 0; var b = 0; var n = 0
                for (xi in maxOf(0, x - r)..minOf(w - 1, x + r)) {
                    val c = p[row + xi]
                    a += (c ushr 24) and 0xff
                    rr += (c ushr 16) and 0xff
                    g += (c ushr 8) and 0xff
                    b += c and 0xff
                    n++
                }
                tmp[row + x] = ((a / n) shl 24) or ((rr / n) shl 16) or ((g / n) shl 8) or (b / n)
            }
        }
        for (x in 0 until w) {
            for (y in 0 until h) {
                var a = 0; var rr = 0; var g = 0; var b = 0; var n = 0
                for (yi in maxOf(0, y - r)..minOf(h - 1, y + r)) {
                    val c = tmp[yi * w + x]
                    a += (c ushr 24) and 0xff
                    rr += (c ushr 16) and 0xff
                    g += (c ushr 8) and 0xff
                    b += c and 0xff
                    n++
                }
                p[y * w + x] = ((a / n) shl 24) or ((rr / n) shl 16) or ((g / n) shl 8) or (b / n)
            }
        }
    }
}
