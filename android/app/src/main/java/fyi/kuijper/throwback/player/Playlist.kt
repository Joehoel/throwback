package fyi.kuijper.throwback.player

import kotlin.random.Random

/**
 * Pure playback order for the slideshow: a cursor over photo ids with O(1) forward/back and a prefetch
 * window. No IO, so fast to unit-test (ADR-0004).
 *
 * Two shapes via the factories:
 *  - [ordered]  : a fixed linear order (chronological) that wraps around — used when shuffle is off.
 *  - [shuffled] : a *shuffle bag* (see [ShufflePlaylist]) — a never-repeating random walk that keeps
 *                 feeling global as folders stream in, instead of a fixed pre-shuffled list.
 */
sealed interface Playlist {
    val current: String?
    val size: Int

    fun next(): String?
    fun previous(): String?

    /** Neighbours around the current position (for prefetch), excluding the current. */
    fun window(ahead: Int, behind: Int): List<String>

    /** Add photos without disturbing the current position; already-present ids are ignored. */
    fun append(ids: List<String>)

    /** Remove photos; keeps the cursor on the same photo where possible (clamped if it's gone). */
    fun remove(ids: List<String>)

    companion object {
        fun ordered(ids: List<String>): Playlist = LinearPlaylist(ids)
        fun shuffled(ids: List<String>, random: Random): Playlist = ShufflePlaylist(ids, random)
    }
}

/** Fixed linear order with wrap-around. New photos append at the tail. */
private class LinearPlaylist(initial: List<String>) : Playlist {
    private val order = ArrayList(initial)
    private var index = 0

    override val current: String? get() = order.getOrNull(index)
    override val size: Int get() = order.size

    override fun append(ids: List<String>) {
        if (ids.isEmpty()) return
        val existing = HashSet(order)
        order.addAll(ids.filterNot(existing::contains))
    }

    override fun remove(ids: List<String>) {
        if (ids.isEmpty()) return
        val drop = HashSet(ids)
        val currentId = current
        if (!order.removeAll { it in drop }) return
        index = when {
            order.isEmpty() -> 0
            currentId != null && currentId !in drop -> order.indexOf(currentId).coerceAtLeast(0)
            else -> index.coerceIn(0, order.size - 1)
        }
    }

    override fun next(): String? {
        if (order.isEmpty()) return null
        index = (index + 1) % order.size
        return current
    }

    override fun previous(): String? {
        if (order.isEmpty()) return null
        index = (index - 1 + order.size) % order.size
        return current
    }

    override fun window(ahead: Int, behind: Int): List<String> {
        if (order.isEmpty()) return emptyList()
        val result = LinkedHashSet<String>()
        for (offset in 1..ahead) result.add(order[(index + offset) % order.size])
        for (offset in 1..behind) result.add(order[(index - offset + order.size * offset) % order.size])
        result.remove(current)
        return result.toList()
    }
}

/**
 * A *shuffle bag*: photos are drawn one at a time at random from a pool of not-yet-shown ids. When the
 * pool empties, a fresh round starts (the whole collection reshuffles) — so the show never repeats the
 * same order on the next loop, and the first photo of a new round is never the one just shown.
 *
 * Why a bag instead of a pre-shuffled list: the index is built incrementally (one folder-batch per crawl
 * step). With a fixed list, batches arriving later could only be tacked on, so playback clustered
 * folder-by-folder. With a bag, [append] just drops new ids into the current round's pool, where they're
 * immediately as likely to be drawn next as anything else — the shuffle stays global as the library grows.
 *
 * Shape:
 *  - [pool]     : ids not yet drawn this round (drawn via swap-remove, so order within doesn't matter).
 *  - [history]  : ids shown so far, oldest→newest. [current] is `history[histPos]`; [previous] walks back
 *                 through it (clamped at the start — there's nothing before the session began).
 *  - [upcoming] : already-drawn ids buffered ahead of the live edge, so [window] can warm the *actual*
 *                 next photos and [next] hands them out in that exact order. Draws here are real draws.
 */
private class ShufflePlaylist(initial: List<String>, private val random: Random) : Playlist {
    private val allIds = LinkedHashSet(initial)
    private val pool = ArrayList(allIds) // current round's remaining ids
    private val history = ArrayList<String>()
    private val upcoming = ArrayDeque<String>()
    private var histPos = 0
    private var lastDrawn: String? = null // last id drawn, to avoid an immediate repeat across rounds

    init {
        drawOne()?.let { history.add(it); histPos = 0 }
    }

    override val current: String? get() = history.getOrNull(histPos)
    override val size: Int get() = allIds.size

    /** Draw a random id from the pool, starting a new round if it's empty. Null only if there are none. */
    private fun drawOne(): String? {
        if (pool.isEmpty()) pool.addAll(allIds) // new round: reshuffle the whole collection
        if (pool.isEmpty()) return null
        var idx = random.nextInt(pool.size)
        // Only ever true right after a refill (mid-round the previous draw is no longer in the pool):
        // nudge off the just-shown id so a new round doesn't open with a duplicate.
        if (pool.size > 1 && pool[idx] == lastDrawn) idx = (idx + 1) % pool.size
        val last = pool.size - 1
        val id = pool[idx]
        pool[idx] = pool[last]
        pool.removeAt(last) // swap-remove: O(1), order in the pool is irrelevant
        lastDrawn = id
        return id
    }

    private fun ensureUpcoming(n: Int) {
        val cap = minOf(n, allIds.size) // never buffer more than the whole collection
        while (upcoming.size < cap) {
            upcoming.addLast(drawOne() ?: break)
        }
    }

    override fun next(): String? {
        if (allIds.isEmpty()) return null
        if (histPos < history.lastIndex) {
            histPos++ // replaying forward after a previous()
        } else {
            val id = if (upcoming.isNotEmpty()) upcoming.removeFirst() else drawOne()
            if (id != null) {
                history.add(id)
                if (history.size > MAX_HISTORY) history.removeAt(0)
                histPos = history.lastIndex
            }
        }
        return current
    }

    override fun previous(): String? {
        if (histPos > 0) histPos-- // clamp at the start: nothing precedes the session
        return current
    }

    override fun window(ahead: Int, behind: Int): List<String> {
        if (allIds.isEmpty()) return emptyList()
        val result = LinkedHashSet<String>()
        var taken = 0
        var i = histPos + 1
        while (taken < ahead && i < history.size) { result.add(history[i]); i++; taken++ }
        if (taken < ahead) {
            ensureUpcoming(ahead - taken)
            for (id in upcoming) {
                if (taken >= ahead) break
                result.add(id); taken++
            }
        }
        var j = histPos - 1
        var b = 0
        while (b < behind && j >= 0) { result.add(history[j]); j--; b++ }
        result.remove(current)
        return result.toList()
    }

    override fun append(ids: List<String>) {
        val fresh = ids.filterNot(allIds::contains)
        if (fresh.isEmpty()) return
        allIds.addAll(fresh)
        pool.addAll(fresh) // eligible immediately, at a random spot in the rest of this round
    }

    override fun remove(ids: List<String>) {
        if (ids.isEmpty()) return
        val drop = ids.toHashSet()
        if (!allIds.removeAll(drop)) return
        pool.removeAll(drop)
        upcoming.removeAll(drop)
        val currentId = current
        history.removeAll(drop)
        histPos = when {
            history.isEmpty() -> 0
            currentId != null && currentId !in drop -> history.indexOf(currentId).coerceAtLeast(0)
            else -> histPos.coerceIn(0, history.size - 1)
        }
        if (history.isEmpty()) {
            drawOne()?.let { history.add(it); histPos = 0 } // current was removed → land on a fresh one
        }
    }

    private companion object {
        // Cap the back-history so a screensaver running for days doesn't grow it without bound;
        // previous() can't reach beyond this many photos back, which is plenty for a remote.
        const val MAX_HISTORY = 1000
    }
}
