package fyi.kuijper.throwback.player

import kotlin.random.Random

/**
 * Pure afspeel-volgorde voor de slideshow: een lijst foto-`id`'s + een cursor.
 * O(1) vooruit/terug met wrap-around, plus een prefetch-venster. Geen IO,
 * dus snel unit-testbaar (ADR-0004: in-memory geschudde afspeellijst).
 */
class Playlist private constructor(val order: List<String>) {

    var index = 0
        private set

    val current: String? get() = order.getOrNull(index)
    val size: Int get() = order.size

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

    /** Buren rondom de huidige positie (voor prefetch), gewrapt, zonder de huidige. */
    fun window(ahead: Int, behind: Int): List<String> {
        if (order.isEmpty()) return emptyList()
        val result = LinkedHashSet<String>()
        for (offset in 1..ahead) result.add(order[(index + offset) % order.size])
        for (offset in 1..behind) result.add(order[(index - offset + order.size * offset) % order.size])
        result.remove(current)
        return result.toList()
    }

    companion object {
        fun ordered(ids: List<String>) = Playlist(ids)
        fun shuffled(ids: List<String>, random: Random) = Playlist(ids.shuffled(random))
    }
}
