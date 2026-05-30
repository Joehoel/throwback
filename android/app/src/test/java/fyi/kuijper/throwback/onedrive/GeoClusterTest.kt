package fyi.kuijper.throwback.onedrive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class GeoClusterTest {

    @Test fun `same event, coordinates within one cell share a key`() {
        // ~10 m apart: same coarse cell (3 decimals ~= 111 m).
        val a = GeoCluster.keyOf("Bruiloft", 52.30811, 5.04141)
        val b = GeoCluster.keyOf("Bruiloft", 52.30815, 5.04149)
        assertEquals(a, b)
    }

    @Test fun `same coordinates but different event do not share a key`() {
        val a = GeoCluster.keyOf("Bruiloft", 52.30811, 5.04141)
        val b = GeoCluster.keyOf("Verjaardag", 52.30811, 5.04141)
        assertNotEquals(a, b)
    }

    @Test fun `same event but far apart do not share a key`() {
        // > 111 m apart in the third decimal: separate cell, separate lookup.
        val a = GeoCluster.keyOf("Vakantie", 52.30811, 5.04141)
        val b = GeoCluster.keyOf("Vakantie", 52.31511, 5.05041)
        assertNotEquals(a, b)
    }

    @Test fun `key uses a locale-independent decimal point`() {
        // Independent of the default locale (e.g. NL with commas).
        val key = GeoCluster.keyOf("Event", 52.5, 5.0)
        assertEquals("Event|52.500,5.000", key)
    }

    @Test fun `grouping photos collapses a clustered event to one lookup`() {
        val photos = listOf(
            row("a", "Bruiloft", 52.30811, 5.04141),
            row("b", "Bruiloft", 52.30815, 5.04149),
            row("c", "Bruiloft", 52.30810, 5.04140),
        )
        val clusters = photos.groupBy { GeoCluster.keyOf(it.event, it.lat!!, it.lon!!) }
        assertEquals(1, clusters.size)
        assertEquals(3, clusters.values.first().size)
    }

    private fun row(id: String, event: String, lat: Double, lon: Double) = PhotoRow(
        id = id, name = id, event = event, year = null, description = null,
        taken = null, path = "/x", lat = lat, lon = lon,
    )
}
