package fyi.kuijper.throwback.ui.surface

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SlideCacheTest {

    @Test
    fun `geeft een opgeslagen waarde terug, en null voor een onbekende sleutel`() {
        val cache = SlideCache<String>(maxSize = 3)
        cache.put("a", "slide-a")
        assertEquals("slide-a", cache.get("a"))
        assertNull(cache.get("b"))
    }

    @Test
    fun `werpt de minst recent gebruikte eruit boven de capaciteit`() {
        val cache = SlideCache<String>(maxSize = 2)
        cache.put("a", "1")
        cache.put("b", "2")
        cache.put("c", "3") // over capacity → "a" (eldest, untouched) is evicted
        assertNull(cache.get("a"))
        assertEquals("2", cache.get("b"))
        assertEquals("3", cache.get("c"))
    }

    @Test
    fun `een net gelezen waarde overleeft uitwerping boven een oudere`() {
        val cache = SlideCache<String>(maxSize = 2)
        cache.put("a", "1")
        cache.put("b", "2")
        cache.get("a")      // touch "a" → now "b" is the least-recently-used
        cache.put("c", "3") // over capacity → "b" is evicted, not "a"
        assertEquals("1", cache.get("a"))
        assertNull(cache.get("b"))
        assertEquals("3", cache.get("c"))
    }

    @Test
    fun `opnieuw zetten van een bestaande sleutel groeit de cache niet`() {
        val cache = SlideCache<String>(maxSize = 2)
        cache.put("a", "1")
        cache.put("b", "2")
        cache.put("a", "1b") // update, not a new slot
        assertEquals("1b", cache.get("a"))
        assertEquals("2", cache.get("b")) // "b" still present → no eviction happened
    }
}
