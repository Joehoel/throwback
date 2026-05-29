package fyi.kuijper.throwback.player

import kotlin.random.Random

/**
 * Pure afspeel-volgorde voor de slideshow: een lijst foto-`id`'s + een cursor.
 * O(1) vooruit/terug met wrap-around, plus een prefetch-venster. Geen IO,
 * dus snel unit-testbaar (ADR-0004: in-memory geschudde afspeellijst).
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

    /**
     * Voeg nieuw geïndexeerde foto's toe zonder de huidige positie te verstoren, zodat een
     * achtergrond-verversing de lopende show kan aanvullen. Reeds aanwezige id's worden genegeerd.
     */
    fun append(ids: List<String>) {
        if (ids.isEmpty()) return
        val existing = HashSet(_order)
        val fresh = ids.filterNot { existing.contains(it) }
        if (fresh.isEmpty()) return
        _order.addAll(if (shuffleNew && random != null) fresh.shuffled(random) else fresh)
    }

    /**
     * Verwijder foto's uit de afspeellijst (bv. in OneDrive verwijderd). Houdt de cursor zo veel
     * mogelijk op dezelfde foto; viel die weg, dan op dezelfde positie (geclamped).
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
        fun ordered(ids: List<String>) = Playlist(ids, shuffleNew = false, random = null)
        fun shuffled(ids: List<String>, random: Random) =
            Playlist(ids.shuffled(random), shuffleNew = true, random = random)
    }
}
