package fyi.kuijper.throwback.player

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.random.Random

class PlaylistTest {

    @Test
    fun `next loopt door en wrapt van laatste naar eerste`() {
        val p = Playlist.ordered(listOf("a", "b", "c"))
        assertEquals("a", p.current)
        assertEquals("b", p.next())
        assertEquals("c", p.next())
        assertEquals("a", p.next()) // wrap-around
    }

    @Test
    fun `previous loopt terug en wrapt van eerste naar laatste`() {
        val p = Playlist.ordered(listOf("a", "b", "c"))
        assertEquals("c", p.previous()) // wrap-around from the first
        assertEquals("b", p.previous())
    }

    @Test
    fun `prefetch-venster geeft buren rondom huidige, gewrapt en zonder huidige`() {
        val p = Playlist.ordered(listOf("a", "b", "c", "d", "e")) // current = a (index 0)
        val window = p.window(ahead = 2, behind = 1)
        // ahead: b, c ; behind (wrapped): e
        assertEquals(setOf("b", "c", "e"), window.toSet())
    }

    @Test
    fun `shuffle is een permutatie en deterministisch bij gelijke seed`() {
        val ids = (1..50).map { it.toString() }
        val a = Playlist.shuffled(ids, Random(42)).order
        val b = Playlist.shuffled(ids, Random(42)).order
        assertEquals(ids.toSet(), a.toSet()) // all items, no loss/duplicate
        assertEquals(a, b)                    // same seed → same order
    }

    @Test
    fun `append mengt nieuwe batch door de staart i p v als blok achteraan`() {
        // Regression: the crawl streams one folder per batch. Tail-appending each batch played
        // folder-by-folder; appended ids must be interleaved so the shuffle stays global.
        val p = Playlist.shuffled((1..20).map { "a$it" }, Random(1))
        p.append((1..20).map { "b$it" })

        val order = p.order
        assertEquals(40, order.size)
        assertEquals(order.toSet(), order.distinct().toSet()) // no duplicates
        // The b-batch must not sit as a contiguous block at the end.
        val tail = order.takeLast(20).toSet()
        assert(tail.any { it.startsWith("a") }) { "new batch clustered at the end: $order" }
    }

    @Test
    fun `append behoudt de huidige foto en raakt het al getoonde deel niet`() {
        val p = Playlist.shuffled((1..10).map { "a$it" }, Random(7))
        p.next() // advance the cursor off the head
        val before = p.current
        val playedSoFar = p.order.subList(0, p.index).toList()

        p.append((1..10).map { "b$it" })

        assertEquals(before, p.current) // cursor still points at the same photo
        assertEquals(playedSoFar, p.order.subList(0, p.index)) // already-shown prefix untouched
    }

    @Test
    fun `append op een lege geschudde playlist werkt`() {
        val p = Playlist.shuffled(emptyList(), Random(3))
        p.append(listOf("x", "y", "z"))
        assertEquals(setOf("x", "y", "z"), p.order.toSet())
    }
}
