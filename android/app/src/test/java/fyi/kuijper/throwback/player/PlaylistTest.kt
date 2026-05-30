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
}
