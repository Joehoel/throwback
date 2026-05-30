package fyi.kuijper.throwback.onedrive

import java.util.Locale

/** Locale-independent "lat,lon" rounded to [decimals] places. */
fun formatCoord(lat: Double, lon: Double, decimals: Int): String =
    "%.${decimals}f,%.${decimals}f".format(Locale.US, lat, lon)

/**
 * Groups photos for reverse-geocoding. Photos of the same event sit close together, so the place label
 * is looked up once per (event x coarse cell) and shared across the cluster — O(events) lookups instead
 * of O(photos). The event is part of the key, so a coarse cell never merges two different events; pure
 * function for testability.
 */
object GeoCluster {
    /** Decimals for cell rounding; ~111 m, well within the spread of a single event. */
    const val PRECISION = 3

    fun keyOf(event: String, lat: Double, lon: Double): String =
        "$event|${formatCoord(lat, lon, PRECISION)}"
}
