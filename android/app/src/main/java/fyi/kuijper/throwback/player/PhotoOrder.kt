package fyi.kuijper.throwback.player

import fyi.kuijper.throwback.onedrive.PhotoRow

/** Pure ordening van foto's voor de afspeellijst (naast shuffle). */
object PhotoOrder {
    /** Chronologisch: jaar, dan opnamedatum, dan naam. Onbekend jaar achteraan. */
    fun chronological(photos: List<PhotoRow>): List<String> =
        photos.sortedWith(
            compareBy({ it.year ?: Int.MAX_VALUE }, { it.taken ?: "9999" }, { it.name }),
        ).map { it.id }
}
