package fyi.kuijper.throwback.player

import fyi.kuijper.throwback.onedrive.PhotoRow

object PhotoOrder {
    /** Sort key: year, then taken date, then name. Unknown year goes last. */
    fun chronological(photos: List<PhotoRow>): List<String> =
        photos.sortedWith(
            compareBy({ it.year ?: Int.MAX_VALUE }, { it.taken ?: "9999" }, { it.name }),
        ).map { it.id }
}
