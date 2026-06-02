package fyi.kuijper.throwback.onedrive

/**
 * Tiny, pure JPEG marker-segment walker — just enough to learn how many leading bytes hold the
 * photo's *header* segments (everything before the compressed image data), so a Range-GET can fetch
 * exactly that and no more.
 *
 * Why it exists: [ExifCaption]'s `ExifInterface` does not stop after the EXIF `APP1` — it walks every
 * header segment (`APP0/APP1/APP2/DQT/DHT/SOF…`), reading or skipping each one with a `readFully`,
 * and **aborts the whole parse with EOFException if any segment is cut off**, only stopping cleanly at
 * the Start-of-Scan (SOS) marker. A camera JPEG embeds a thumbnail in EXIF, pushing that `APP1` up to
 * its ~64 KB marker limit, with XMP and an ICC `APP2` after it — so the caption (in EXIF/XMP near the
 * front) is lost unless the slice reaches SOS. [headerEnd] reports where SOS begins; when the headers
 * run past the bytes in hand it reports a "need at least this much" value so the caller can widen.
 * Android-free, so it unit-tests without a device.
 *
 * Bounds we lean on (EXIF/JEITA + Adobe XMP specs): a single EXIF `APP1` is ≤ ~64 KB and is the first
 * segment after SOI; Standard XMP is likewise one ≤ ~64 KB `APP1`. So for ordinary photos SOS sits
 * within ~128 KB of the start; only Extended XMP or a large ICC profile pushes it further.
 */
object JpegSegments {
    private const val SOI = 0xD8   // start of image
    private const val SOS = 0xDA   // start of scan — compressed data begins; ExifInterface stops here
    private const val EOI = 0xD9   // end of image
    private const val TEM = 0x01   // standalone marker, no length
    private const val SOS_MARKER_LEN = 2

    /**
     * Number of leading bytes that cover every JPEG header segment up to (and including) the SOS
     * marker — i.e. the smallest slice `ExifInterface` can parse without hitting a truncated segment.
     * Returns `null` if [bytes] is not a JPEG (no SOI) or is malformed.
     *
     * If SOS has not been reached within [bytes], returns a value **greater than `bytes.size`**: the
     * end a segment is *declared* to reach, or just past the buffer when the next header can't be read
     * yet. Either way it is the caller's signal to widen the read and try again.
     */
    fun headerEnd(bytes: ByteArray): Int? {
        if (bytes.size < 4 || u8(bytes, 0) != 0xFF || u8(bytes, 1) != SOI) return null
        var i = 2
        while (true) {
            if (i + 2 > bytes.size) return maxOf(i, bytes.size + 1) // can't read a marker → need ≥ here
            if (u8(bytes, i) != 0xFF) return null                   // not at a marker → malformed
            val marker = u8(bytes, i + 1)
            if (marker == SOS || marker == EOI) return i + SOS_MARKER_LEN   // headers complete (2-byte marker)
            if (marker == TEM || marker in 0xD0..0xD7) {            // standalone markers carry no length
                i += 2
                continue
            }
            if (i + 4 > bytes.size) return i + 4                    // length field not in buffer → need more
            val len = (u8(bytes, i + 2) shl 8) or u8(bytes, i + 3)
            if (len < 2) return null                                // malformed length field
            i += 2 + len                                            // advance past this segment's body
        }
    }

    private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF
}
