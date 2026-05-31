package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.PlaceResolver
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class IndexUpdaterTest {

    private val added = mutableListOf<String>()
    private val removed = mutableListOf<String>()
    private val dao = FakePhotoDao()
    // Fake geocoder: every located photo gets the same label.
    private val updater = IndexUpdater(
        dao,
        PlaceResolver { _, _ -> "Urk" },
        onAdded = { added += it },
        onRemoved = { removed += it },
    )

    private fun photo(id: String, lat: Double? = null, lon: Double? = null) =
        PhotoRow(id = id, name = id, event = "E", year = null, description = null, taken = null, path = "/x", lat = lat, lon = lon)

    @Test fun `store persists rows and reveals them in the show, without geocoding`() = runBlocking {
        updater.store("F", listOf(photo("a", 52.3, 5.0), photo("b")))
        assertEquals(2, dao.count("F"))
        assertEquals(listOf("a", "b"), added)
        // Geocoding is deferred: the GPS photo still has no place label yet.
        assertEquals(listOf("a"), dao.photosNeedingPlace("F").map { it.id })
    }

    @Test fun `geocodePending labels the photos that still lack a place`() = runBlocking {
        updater.store("F", listOf(photo("a", 52.3, 5.0), photo("b")))
        updater.geocodePending("F")
        assertEquals("Urk", dao.get("a")?.place)
        assertEquals(emptyList<String>(), dao.photosNeedingPlace("F").map { it.id })
    }

    @Test fun `store ignores an empty batch`() = runBlocking {
        updater.store("F", emptyList())
        assertEquals(0, dao.count("F"))
        assertEquals(emptyList<String>(), added)
    }

    @Test fun `apply removes deletions, upserts changes, notifies the show and geocodes inline`() = runBlocking {
        updater.store("F", listOf(photo("old"), photo("a", 52.3, 5.0)))
        added.clear()

        updater.apply("F", GraphSync.Changes(upserts = listOf(photo("new", 52.3, 5.0)), deletedIds = listOf("old"), newDeltaLink = "x"))

        assertEquals(listOf("old"), removed)
        assertEquals(listOf("new"), added)
        assertEquals("Urk", dao.get("new")?.place) // delta geocodes inline
        assertEquals(setOf("a", "new"), dao.allPhotos("F").map { it.id }.toSet())
    }
}

/** In-memory [PhotoDao]; only the methods [IndexUpdater] touches are implemented. */
private class FakePhotoDao : PhotoDao {
    private val rows = LinkedHashMap<String, PhotoRow>()

    override suspend fun count(rootId: String) = rows.values.count { it.rootId == rootId }

    override suspend fun upsertAll(rootId: String, rows: List<PhotoRow>) {
        for (r in rows) {
            val existing = this.rows[r.id]
            // Mirror the real DAO: a re-upsert keeps the already-geocoded place.
            this.rows[r.id] = r.copy(rootId = rootId, place = existing?.place ?: r.place)
        }
    }

    override suspend fun deleteIds(ids: List<String>) {
        ids.forEach { rows.remove(it) }
    }

    override suspend fun get(id: String) = rows[id]

    override suspend fun allPhotos(rootId: String) = rows.values.filter { it.rootId == rootId }

    override suspend fun photosNeedingPlace(rootId: String) =
        rows.values.filter { it.rootId == rootId && it.lat != null && it.lon != null && it.place == null }

    override suspend fun updatePlaces(places: Map<String, String?>) {
        for ((id, place) in places) rows[id]?.let { rows[id] = it.copy(place = place) }
    }

    // Unused by IndexUpdater.
    override suspend fun insertIgnore(rows: List<PhotoRow>) = error("unused")
    override suspend fun updateKeepingPlace(
        id: String, name: String, event: String, year: Int?, description: String?,
        taken: String?, path: String, lat: Double?, lon: Double?, rootId: String?,
    ) = error("unused")
    override suspend fun updatePlace(id: String, place: String?) = error("unused")
    override suspend fun getMeta(key: String): String? = error("unused")
    override suspend fun setMetaEntity(entity: fyi.kuijper.throwback.db.MetaEntity) = error("unused")
    override suspend fun clearPhotos() = error("unused")
    override suspend fun clearMeta() = error("unused")
}
