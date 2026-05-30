package fyi.kuijper.throwback.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import fyi.kuijper.throwback.onedrive.PhotoRow

/**
 * Persistentie-interface voor de lokale index (zie ADR-0004). Room genereert de implementatie; de
 * engines praten hier rechtstreeks tegenaan — geen extra repository-laag, want die zou enkel
 * doorgeven. De index is **per gekozen map** ([PhotoRow.rootId]); de DAO stempelt die bij het opslaan.
 */
@Dao
interface PhotoDao {

    @Query("SELECT COUNT(*) FROM photo WHERE rootId = :rootId")
    suspend fun count(rootId: String): Int

    /**
     * Upsert per foto onder map [rootId]. Een crawl levert nooit een [PhotoRow.place] (die zet de
     * geocode-pass apart), dus bij een bestaande rij laten we `place` met rust — anders zou een
     * her-crawl het zojuist gegeocodete label wissen. Nieuwe rijen worden ingevoegd inclusief `place`.
     */
    @Transaction
    suspend fun upsertAll(rootId: String, rows: List<PhotoRow>) {
        if (rows.isEmpty()) return
        val stamped = rows.map { it.copy(rootId = rootId) }
        insertIgnore(stamped) // nieuwe rijen incl. place; bestaande blijven ongemoeid
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

    @Query("SELECT id FROM photo WHERE rootId = :rootId")
    suspend fun allIds(rootId: String): List<String>

    @Query("SELECT * FROM photo WHERE rootId = :rootId")
    suspend fun allPhotos(rootId: String): List<PhotoRow>

    /** Foto's (in map [rootId]) met GPS maar nog zonder geocodet [PhotoRow.place]. */
    @Query("SELECT * FROM photo WHERE rootId = :rootId AND lat IS NOT NULL AND lon IS NOT NULL AND place IS NULL")
    suspend fun photosNeedingPlace(rootId: String): List<PhotoRow>

    @Query("UPDATE photo SET place = :place WHERE id = :id")
    suspend fun updatePlace(id: String, place: String?)

    /** Schrijf een batch plaats-labels in één transactie (na het clusteren in de geocode-pass). */
    @Transaction
    suspend fun updatePlaces(places: Map<String, String?>) {
        for ((id, place) in places) updatePlace(id, place)
    }

    // --- meta (key-value) ---

    @Query("SELECT v FROM meta WHERE k = :key")
    suspend fun getMeta(key: String): String?

    @Upsert
    suspend fun setMetaEntity(entity: MetaEntity)

    suspend fun setMeta(key: String, value: String?) = setMetaEntity(MetaEntity(key, value))

    // Delta-token per map.
    suspend fun deltaLinkFor(rootId: String): String? = getMeta("delta_link:$rootId")
    suspend fun setDeltaLink(rootId: String, value: String?) = setMeta("delta_link:$rootId", value)

    // --- volledig wissen (loskoppelen) ---

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
