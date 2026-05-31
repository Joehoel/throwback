package fyi.kuijper.throwback.onedrive

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * Exercises the geocoding *policy* (clustering, caching, skipping) apart from Android's Geocoder, via
 * the injectable single-coordinate lookup. The Geocoder + label composition itself is covered by
 * [PlaceLabelTest]/[GeoClusterTest].
 */
class PlaceResolverTest {

    private fun row(id: String, event: String, lat: Double?, lon: Double?, place: String? = null) =
        PhotoRow(
            id = id, name = id, event = event, year = null, description = null,
            taken = null, path = "/x", lat = lat, lon = lon, place = place,
        )

    @Test fun `one event in one cell is looked up once and shared across its photos`() = runBlocking {
        val calls = AtomicInteger()
        val resolver = PlaceResolver { _, _ -> calls.incrementAndGet(); "Urk" }
        val out = resolver.resolve(
            listOf(
                row("a", "Bruiloft", 52.30811, 5.04141),
                row("b", "Bruiloft", 52.30815, 5.04149),
                row("c", "Bruiloft", 52.30810, 5.04140),
            ),
        )
        assertEquals(mapOf("a" to "Urk", "b" to "Urk", "c" to "Urk"), out)
        assertEquals("één opzoeking per cluster", 1, calls.get())
    }

    @Test fun `photos in different places each get their own label`() = runBlocking {
        val resolver = PlaceResolver { lat, _ -> if (lat > 52.5) "Noord" else "Zuid" }
        val out = resolver.resolve(
            listOf(
                row("a", "Bruiloft", 52.30811, 5.04141),
                row("b", "Vakantie", 53.20000, 6.00000),
            ),
        )
        assertEquals(mapOf("a" to "Zuid", "b" to "Noord"), out)
    }

    @Test fun `the same coordinate is looked up once, even across different events`() = runBlocking {
        // The per-coordinate cache dedups identical spots beyond the per-event clustering: two events
        // at the exact same GPS point share one lookup (and the same label).
        val calls = AtomicInteger()
        val resolver = PlaceResolver { _, _ -> calls.incrementAndGet(); "Urk" }
        val out = resolver.resolve(
            listOf(
                row("a", "Bruiloft", 52.30811, 5.04141),
                row("b", "Verjaardag", 52.30811, 5.04141),
            ),
        )
        assertEquals(mapOf("a" to "Urk", "b" to "Urk"), out)
        assertEquals(1, calls.get())
    }

    @Test fun `photos without GPS or already placed are skipped`() = runBlocking {
        val calls = AtomicInteger()
        val resolver = PlaceResolver { _, _ -> calls.incrementAndGet(); "Urk" }
        val out = resolver.resolve(
            listOf(
                row("nogps", "A", null, null),
                row("placed", "B", 52.1, 5.1, place = "Al bekend"),
            ),
        )
        assertEquals(emptyMap<String, String>(), out)
        assertEquals(0, calls.get())
    }

    @Test fun `a coordinate is cached across calls (including a negative result)`() = runBlocking {
        val calls = AtomicInteger()
        val resolver = PlaceResolver { _, _ -> calls.incrementAndGet(); null } // no usable address
        val photos = listOf(row("a", "Bruiloft", 52.30811, 5.04141))
        assertEquals(emptyMap<String, String>(), resolver.resolve(photos))
        assertEquals(emptyMap<String, String>(), resolver.resolve(photos))
        assertEquals("negatief resultaat blijft gecachet, geen herhaalde opzoeking", 1, calls.get())
    }

    @Test fun `a transient failure is not cached, so a later pass retries`() = runBlocking {
        val calls = AtomicInteger()
        val resolver = PlaceResolver { _, _ ->
            if (calls.getAndIncrement() == 0) error("rate limited") else "Urk"
        }
        val photos = listOf(row("a", "Bruiloft", 52.30811, 5.04141))
        assertEquals(emptyMap<String, String>(), resolver.resolve(photos)) // throws -> omitted, uncached
        assertEquals(mapOf("a" to "Urk"), resolver.resolve(photos)) // retried -> resolved
        assertEquals(2, calls.get())
    }
}
