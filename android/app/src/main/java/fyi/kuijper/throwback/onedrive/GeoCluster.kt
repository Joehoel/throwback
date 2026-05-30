package fyi.kuijper.throwback.onedrive

import java.util.Locale

/**
 * Groepeert foto's voor het reverse-geocoden. Foto's van dezelfde gebeurtenis liggen ruimtelijk dicht
 * bij elkaar, dus we hoeven het plaats-label maar één keer op te zoeken per (gebeurtenis × grove cel)
 * en delen het over de cluster — O(gebeurtenissen) opzoekingen i.p.v. O(foto's).
 *
 * De grove cel ([PRECISION] decimalen ≈ 111 m) zou tússen gebeurtenissen verschillende straten op één
 * hoop kunnen vegen, maar omdat de gebeurtenis in de sleutel zit blijft elke gebeurtenis z'n eigen
 * opzoeking houden. Pure functie, zodat het gedrag los te testen is.
 */
object GeoCluster {
    /** Aantal decimalen voor de cel-afronding; ~111 m, ruim binnen de spreiding van één gebeurtenis. */
    const val PRECISION = 3

    fun keyOf(event: String, lat: Double, lon: Double): String =
        "$event|${round(lat)},${round(lon)}"

    private fun round(v: Double): String = "%.${PRECISION}f".format(Locale.US, v)
}
