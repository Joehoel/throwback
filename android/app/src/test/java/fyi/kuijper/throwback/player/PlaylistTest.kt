package fyi.kuijper.throwback.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class PlaylistTest {

    // --- ordered (linear, wrap-around) ---

    @Test
    fun `ordered loopt door en wrapt van laatste naar eerste`() {
        val p = Playlist.ordered(listOf("a", "b", "c"))
        assertEquals("a", p.current)
        assertEquals("b", p.next())
        assertEquals("c", p.next())
        assertEquals("a", p.next()) // wrap-around
    }

    @Test
    fun `ordered loopt terug en wrapt van eerste naar laatste`() {
        val p = Playlist.ordered(listOf("a", "b", "c"))
        assertEquals("c", p.previous()) // wrap-around from the first
        assertEquals("b", p.previous())
    }

    @Test
    fun `ordered prefetch-venster geeft buren rondom huidige, gewrapt en zonder huidige`() {
        val p = Playlist.ordered(listOf("a", "b", "c", "d", "e")) // current = a (index 0)
        val window = p.window(ahead = 2, behind = 1)
        assertEquals(setOf("b", "c", "e"), window.toSet()) // ahead: b,c ; behind (wrapped): e
    }

    // --- shuffle bag ---

    @Test
    fun `bag toont elke foto precies een keer per ronde`() {
        val ids = (1..20).map { "p$it" }
        val p = Playlist.shuffled(ids, Random(42))
        val round = mutableListOf(p.current!!)
        repeat(ids.size - 1) { round.add(p.next()!!) }
        assertEquals(ids.toSet(), round.toSet()) // every photo, no loss
        assertEquals(ids.size, round.distinct().size) // no duplicate within a round
    }

    @Test
    fun `bag herschudt elke ronde i p v dezelfde volgorde te herhalen`() {
        val ids = (1..30).map { "p$it" }
        val p = Playlist.shuffled(ids, Random(7))
        val first = (listOf(p.current!!) + (1 until ids.size).map { p.next()!! })
        val second = (1..ids.size).map { p.next()!! }
        assertEquals(ids.toSet(), second.toSet()) // still a full permutation
        assertNotEquals(first, second) // ...but a different order than the previous loop
    }

    @Test
    fun `bag herhaalt de net getoonde foto niet op de rondegrens`() {
        val ids = (1..15).map { "p$it" }
        val p = Playlist.shuffled(ids, Random(3))
        val seq = (listOf(p.current!!) + (1..ids.size * 4).map { p.next()!! })
        for (i in 1 until seq.size) {
            assertNotEquals("repeat at $i in $seq", seq[i - 1], seq[i])
        }
    }

    @Test
    fun `bag determinisme bij gelijke seed`() {
        val ids = (1..40).map { "p$it" }
        fun play(): List<String> {
            val p = Playlist.shuffled(ids, Random(99))
            return listOf(p.current!!) + (1..100).map { p.next()!! }
        }
        assertEquals(play(), play()) // same seed → same walk
    }

    @Test
    fun `bag append laat nieuwe foto nog deze ronde verschijnen`() {
        val p = Playlist.shuffled(listOf("a"), Random(1)) // tiny round, current = a
        p.append((1..50).map { "b$it" })
        // Within the next 50 draws (round size is now 51) we must see at least one b — they're in the pool,
        // not stuck behind a whole round of a's.
        val seen = (1..50).map { p.next()!! }.toSet()
        assertTrue("appended ids never showed: $seen", seen.any { it.startsWith("b") })
    }

    @Test
    fun `bag previous loopt terug door history en clamped aan het begin`() {
        val p = Playlist.shuffled((1..10).map { "p$it" }, Random(5))
        val a = p.current
        val b = p.next()
        val c = p.next()
        assertEquals(b, p.previous())
        assertEquals(a, p.previous())
        assertEquals(a, p.previous()) // clamped — nothing before the start
        assertEquals(b, p.next())     // replays forward through history
        assertEquals(c, p.next())
    }

    @Test
    fun `bag prefetch-venster geeft de echte aankomende foto's`() {
        val p = Playlist.shuffled((1..20).map { "p$it" }, Random(11))
        val ahead = p.window(ahead = 3, behind = 0)
        assertEquals(3, ahead.size)
        // The window must predict exactly what next() then hands out, in order.
        assertEquals(ahead, (1..3).map { p.next()!! })
    }

    @Test
    fun `bag remove van huidige toont een geldige volgende`() {
        val p = Playlist.shuffled((1..10).map { "p$it" }, Random(8))
        val gone = p.current!!
        p.remove(listOf(gone))
        assertEquals(9, p.size)
        assertNotEquals(gone, p.current)
        assertTrue(p.current != null)
    }

    @Test
    fun `bag remove van alles laat lege playlist achter`() {
        val ids = (1..5).map { "p$it" }
        val p = Playlist.shuffled(ids, Random(2))
        p.remove(ids)
        assertEquals(0, p.size)
        assertNull(p.current)
        assertNull(p.next())
    }

    @Test
    fun `bag append op lege playlist werkt`() {
        val p = Playlist.shuffled(emptyList(), Random(4))
        assertNull(p.current)
        p.append(listOf("x", "y", "z"))
        assertTrue(p.next() in setOf("x", "y", "z"))
    }
}
