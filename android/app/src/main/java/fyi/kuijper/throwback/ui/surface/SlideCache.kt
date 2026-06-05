package fyi.kuijper.throwback.ui.surface

/**
 * EXPLORATION (branch explore/surfaceview-4k). A tiny access-order LRU so the surface renderer can hand
 * an already-decoded slide straight to the screen instead of re-decoding on every next/previous.
 *
 * Why: the surface path decodes a software bitmap (`allowHardware(false)`) and rebuilds the portrait blur
 * per photo — too slow to gate every key-press on. The engine's Coil prefetch can't help (it warms
 * hardware bitmaps, unusable here), so we keep the last few decoded slides ourselves. Bounded so a long
 * run can't grow without limit.
 *
 * Generic over the value type purely so the eviction logic is unit-testable without Android bitmaps;
 * the production type is `SlideCache<PhotoSurfaceView.Slide>`. Synchronised because the decode (put) runs
 * off-thread while a cache hit (get) is read on the main thread.
 */
class SlideCache<V>(private val maxSize: Int) {
    init { require(maxSize >= 1) { "maxSize must be >= 1" } }

    // accessOrder = true → get() marks an entry most-recently-used, so the eldest is the true LRU victim.
    private val map = object : LinkedHashMap<String, V>(0, 0.75f, true) {}

    @Synchronized
    fun get(key: String): V? = map[key]

    @Synchronized
    fun put(key: String, value: V) {
        map[key] = value
        while (map.size > maxSize) map.remove(map.keys.iterator().next())
    }
}
