package fyi.kuijper.throwback.ui.components

import android.graphics.Bitmap
import coil3.size.Size
import coil3.transform.Transformation

/**
 * Vervaag een afbeelding via de bitmap zelf (CPU), zodat de wazige achtergrond op élk Android-niveau
 * werkt — `Modifier.blur` doet pas iets vanaf API 31 (Android 12). De KPN-box draait Android 11, dus
 * daar viel de blur weg. We schalen flink terug en doen een gescheiden box-blur (2× ≈ Gaussiaans);
 * Coil schaalt het resultaat weer schermvullend op, wat extra smoothing geeft. Snel én gecachet.
 */
class BlurTransformation(
    private val radius: Int = 10,
    private val sampleWidth: Int = 200,
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

    /** Gescheiden box-blur (horizontaal daarna verticaal) over een [r]-venster per kanaal. */
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
