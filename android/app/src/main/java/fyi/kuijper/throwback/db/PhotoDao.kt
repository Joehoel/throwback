package fyi.kuijper.throwback.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import fyi.kuijper.throwback.onedrive.PhotoRow

/**
 * Persistence interface for the local index (see ADR-0004). Room generates the implementation; engines
 * talk to it directly — no extra repository layer, since it would only forward. The index is per chosen
 * folder ([PhotoRow.rootId]); the DAO stamps it on save.
 */
@Dao
interface PhotoDao {

    @Query("SELECT COUNT(*) FROM photo WHERE rootId = :rootId")
    suspend fun count(rootId: String): Int

    /** Photos under [rootId] that carry GPS — the denominator for the geocoding progress row. */
    @Query("SELECT COUNT(*) FROM photo WHERE rootId = :rootId AND lat IS NOT NULL AND lon IS NOT NULL")
    suspend fun countWithGps(rootId: String): Int

    /** Photos under [rootId] that already have a reverse-geocoded place label. */
    @Query("SELECT COUNT(*) FROM photo WHERE rootId = :rootId AND place IS NOT NULL")
    suspend fun countGeocoded(rootId: String): Int

    /**
     * Upsert per photo under [rootId]. A crawl never carries a [PhotoRow.place] (the geocode pass sets
     * that separately), so for an existing row we leave `place` untouched — otherwise a re-crawl would
     * wipe the just-geocoded label. New rows are inserted including `place`.
     */
    @Transaction
    suspend fun upsertAll(rootId: String, rows: List<PhotoRow>) {
        if (rows.isEmpty()) return
        val stamped = rows.map { it.copy(rootId = rootId) }
        insertIgnore(stamped) // new rows incl. place; existing rows untouched
        for (r in stamped) {
            updateKeepingPlace(
                id = r.id, name = r.name, event = r.event, year = r.year,
                description = r.description, taken = r.taken, path = r.path,
                lat = r.lat, lon = r.lon, rootId = r.rootId,
            )
        }
    }

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(rows: List<PhotoRow>)

    @Query(
        """UPDATE photo SET name = :name, event = :event, year = :year, description = :description,
           taken = :taken, path = :path, lat = :lat, lon = :lon, rootId = :rootId WHERE id = :id""",
    )
    suspend fun updateKeepingPlace(
        id: String, name: String, event: String, year: Int?, description: String?,
        taken: String?, path: String, lat: Double?, lon: Double?, rootId: String?,
    )

    @Query("DELETE FROM photo WHERE id IN (:ids)")
    suspend fun deleteIds(ids: List<String>)

    @Query("SELECT * FROM photo WHERE id = :id")
    suspend fun get(id: String): PhotoRow?

    @Query("SELECT * FROM photo WHERE rootId = :rootId")
    suspend fun allPhotos(rootId: String): List<PhotoRow>

    /** Photos (in [rootId]) with GPS but no geocoded [PhotoRow.place] yet. */
    @Query("SELECT * FROM photo WHERE rootId = :rootId AND lat IS NOT NULL AND lon IS NOT NULL AND place IS NULL")
    suspend fun photosNeedingPlace(rootId: String): List<PhotoRow>

    @Query("UPDATE photo SET place = :place WHERE id = :id")
    suspend fun updatePlace(id: String, place: String?)

    /** Write a batch of place labels in one transaction (after clustering in the geocode pass). */
    @Transaction
    suspend fun updatePlaces(places: Map<String, String?>) {
        for ((id, place) in places) updatePlace(id, place)
    }

    @Query("SELECT v FROM meta WHERE k = :key")
    suspend fun getMeta(key: String): String?

    @Upsert
    suspend fun setMetaEntity(entity: MetaEntity)

    suspend fun setMeta(key: String, value: String?) = setMetaEntity(MetaEntity(key, value))

    suspend fun deltaLinkFor(rootId: String): String? = getMeta("delta_link:$rootId")
    suspend fun setDeltaLink(rootId: String, value: String?) = setMeta("delta_link:$rootId", value)

    @Transaction
    suspend fun clearAll() {
        clearPhotos()
        clearMeta()
    }

    @Query("DELETE FROM photo")
    suspend fun clearPhotos()

    @Query("DELETE FROM meta")
    suspend fun clearMeta()
}
