package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JpegSegmentsTest {

    private fun bytes(vararg ints: Int) = ByteArray(ints.size) { ints[it].toByte() }

    /** A length field is big-endian and includes its own 2 bytes. */
    private fun len(n: Int) = intArrayOf(n ushr 8, n and 0xFF)

    @Test
    fun `geen JPEG (geen SOI) geeft null`() {
        assertNull(JpegSegments.headerEnd(bytes(0x12, 0x34, 0x56, 0x78)))
        assertNull(JpegSegments.headerEnd(bytes(0xFF, 0xD8))) // alleen SOI, te kort
    }

    @Test
    fun `headers gevolgd door start-of-scan geven het SOS-eind`() {
        // SOI, APP1(len=6) -> eindigt op 10, dan SOS (FFDA) op 10 -> header-eind = 10 + 2 = 12.
        val b = bytes(
            0xFF, 0xD8,
            0xFF, 0xE1, *len(6), 0, 0, 0, 0,
            0xFF, 0xDA,
        )
        assertEquals(12, JpegSegments.headerEnd(b))
    }

    @Test
    fun `meerdere header-segmenten worden doorlopen tot de scan`() {
        // SOI, APP1(len=6)->10, APP1(len=8)->20, APP2(len=6)->28, SOS -> 28 + 2 = 30.
        val b = bytes(
            0xFF, 0xD8,
            0xFF, 0xE1, *len(6), 0, 0, 0, 0,
            0xFF, 0xE1, *len(8), 0, 0, 0, 0, 0, 0,
            0xFF, 0xE2, *len(6), 0, 0, 0, 0,
            0xFF, 0xDA,
        )
        assertEquals(30, JpegSegments.headerEnd(b))
    }

    @Test
    fun `een segment dat voorbij de buffer reikt vraagt om meer (groter dan size)`() {
        // APP1 zegt 256 bytes te zijn maar we leveren er maar 10 -> verwacht 2 + 2 + 256 = 260 (> size).
        val b = bytes(0xFF, 0xD8, 0xFF, 0xE1, *len(256), 0, 0, 0, 0)
        val end = JpegSegments.headerEnd(b)!!
        assertEquals(260, end)
        assertTrue("signaal om te verbreden", end > b.size)
    }

    @Test
    fun `nog geen scan in de buffer vraagt om meer`() {
        // Volledige APP1(len=6) maar de buffer stopt voor de volgende marker -> need-more (> size).
        val b = bytes(0xFF, 0xD8, 0xFF, 0xE1, *len(6), 0, 0, 0, 0)
        val end = JpegSegments.headerEnd(b)!!
        assertTrue("moet meer vragen want SOS nog niet bereikt: $end vs ${b.size}", end > b.size)
    }

    @Test
    fun `rommel in plaats van een marker geeft null`() {
        val b = bytes(0xFF, 0xD8, 0x00, 0x11, 0x22, 0x33)
        assertNull(JpegSegments.headerEnd(b))
    }
}
