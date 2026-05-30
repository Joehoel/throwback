package fyi.kuijper.throwback.player

import kotlin.random.Random

/**
 * Pure playback order for the slideshow: a list of photo ids + a cursor. O(1) forward/back with
 * wrap-around, plus a prefetch window. No IO, so fast to unit-test (ADR-0004: in-memory shuffled playlist).
 */
class Playlist private constructor(
    initial: List<String>,
    private val shuffleNew: Boolean,
    private val random: Random?,
) {

    private val _order = ArrayList(initial)
    val order: List<String> get() = _order

    var index = 0
        private set

    val current: String? get() = order.getOrNull(index)
    val size: Int get() = order.size

    /** Append photos without disturbing the current position; already-present ids are ignored. */
    fun append(ids: List<String>) {
        if (ids.isEmpty()) return
        val existing = HashSet(_order)
        val fresh = ids.filterNot { existing.contains(it) }
        if (fresh.isEmpty()) return
        _order.addAll(if (shuffleNew && random != null) fresh.shuffled(random) else fresh)
    }

    /**
     * Remove photos from the playlist. Keeps the cursor on the same photo where possible; if that one
     * is gone, stays at the same position (clamped).
     */
    fun remove(ids: List<String>) {
        if (ids.isEmpty()) return
        val drop = HashSet(ids)
        val currentId = current
        if (!_order.removeAll { it in drop }) return
        index = when {
            _order.isEmpty() -> 0
            currentId != null && currentId !in drop -> _order.indexOf(currentId).coerceAtLeast(0)
            else -> index.coerceIn(0, _order.size - 1)
        }
    }

    fun next(): String? {
        if (order.isEmpty()) return null
        index = (index + 1) % order.size
        return current
    }

    fun previous(): String? {
        if (order.isEmpty()) return null
        index = (index - 1 + order.size) % order.size
        return current
    }

    /** Neighbours around the current position (for prefetch), wrapped, excluding the current. */
    fun window(ahead: Int, behind: Int): List<String> {
        if (order.isEmpty()) return emptyList()
        val result = LinkedHashSet<String>()
        for (offset in 1..ahead) result.add(order[(index + offset) % order.size])
        for (offset in 1..behind) result.add(order[(index - offset + order.size * offset) % order.size])
        result.remove(current)
        return result.toList()
    }

    companion object {
        fun ordered(ids: List<String>) = Playlist(ids, shuffleNew = false, random = null)
        fun shuffled(ids: List<String>, random: Random) =
            Playlist(ids.shuffled(random), shuffleNew = true, random = random)
    }
}
