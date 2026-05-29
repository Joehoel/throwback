package fyi.kuijper.throwback.onedrive

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Eén geïndexeerde foto uit de bibliotheek. [lat]/[lon] = GPS uit de fotometadata, indien aanwezig.
 * [place] = bij het indexeren reverse-geocodet plaats-label (zie [PlaceResolver]); null = (nog) geen.
 */
data class PhotoRow(
    val id: String,
    val name: String,
    val event: String,
    val year: Int?,
    val description: String?,
    val taken: String?,
    val path: String,
    val lat: Double? = null,
    val lon: Double? = null,
    val place: String? = null,
)

/**
 * Lokale index (bron van waarheid voor de show), zie ADR-0004.
 * Handgeschreven SQLite i.p.v. Room — zelfde rol, geen KSP/annotation-processing.
 * Alle calls horen op een achtergrond-thread te draaien (ViewModel doet dat via IO).
 *
 * De index is **per gekozen map** (`root_id`): wisselen van map wist niets, elke map houdt z'n eigen
 * rijen, delta-token en reconcile-vlag. Zo is terugschakelen naar een eerder geïndexeerde map direct
 * + een goedkope delta-verversing, i.p.v. een volledige her-crawl.
 */
class PhotoDb(context: Context) : SQLiteOpenHelper(context.applicationContext, "throwback.db", null, 5) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE photo (" +
                "id TEXT PRIMARY KEY, name TEXT, event TEXT, year INTEGER, " +
                "description TEXT, taken TEXT, path TEXT, lat REAL, lon REAL, place TEXT, root_id TEXT)"
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_photo_root ON photo(root_id)")
        db.execSQL("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    }

    /**
     * Additieve migratie: voeg ontbrekende kolommen toe i.p.v. de index weg te gooien, zodat een
     * upgrade de (grote) bibliotheek niet opnieuw hoeft te downloaden. v1→ lat/lon, v2→ place,
     * v3→ root_id. Bestaande rijen krijgen root_id = null; [claimUnassigned] wijst ze bij de eerste
     * sync toe aan de huidige map. Nieuwe kolommen worden door de achtergrond-sync gevuld.
     *
     * v4→v5: place wissen zodat de geocode-pass ze opnieuw opzoekt. De oude cache rondde coördinaten
     * af op ~111 m, waardoor foto's binnen één cel de straat + huisnummer van de eerst-opgezochte foto
     * erfden. Met de fijnere sleutel ([PlaceResolver.key]) zoekt elke foto z'n eigen adres op.
     */
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        val cols = existingColumns(db, "photo")
        if ("lat" !in cols) db.execSQL("ALTER TABLE photo ADD COLUMN lat REAL")
        if ("lon" !in cols) db.execSQL("ALTER TABLE photo ADD COLUMN lon REAL")
        if ("place" !in cols) db.execSQL("ALTER TABLE photo ADD COLUMN place TEXT")
        if ("root_id" !in cols) db.execSQL("ALTER TABLE photo ADD COLUMN root_id TEXT")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_photo_root ON photo(root_id)")
        db.execSQL("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
        if (oldVersion < 5 && "place" in cols) db.execSQL("UPDATE photo SET place = NULL")
    }

    private fun existingColumns(db: SQLiteDatabase, table: String): Set<String> {
        val cols = HashSet<String>()
        db.rawQuery("PRAGMA table_info($table)", null).use {
            val nameIdx = it.getColumnIndex("name")
            while (it.moveToNext()) cols.add(it.getString(nameIdx))
        }
        return cols
    }

    /** Wijs nog niet-toegewezen rijen (uit een oudere één-index-versie) toe aan [rootId]. */
    fun claimUnassigned(rootId: String) {
        val cv = ContentValues().apply { put("root_id", rootId) }
        writableDatabase.update("photo", cv, "root_id IS NULL", null)
    }

    /**
     * Upsert per foto onder map [rootId]. Crucial: bij een bestaande rij werken we de data-kolommen
     * bij maar laten we [PhotoRow.place] met rust (een crawl levert nooit een place; die zet de
     * geocode-pass apart) — anders zou een her-crawl het zojuist gegeocodete label weer wissen.
     * Nieuwe rijen worden ingevoegd inclusief place. (Geen SQLite-UPSERT: < API 30 / minSdk 26.)
     */
    fun upsertAll(rootId: String, rows: List<PhotoRow>) {
        if (rows.isEmpty()) return
        with(writableDatabase) {
            beginTransaction()
            try {
                for (r in rows) {
                    val data = ContentValues().apply {
                        put("name", r.name)
                        put("event", r.event)
                        if (r.year != null) put("year", r.year) else putNull("year")
                        if (r.description != null) put("description", r.description) else putNull("description")
                        if (r.taken != null) put("taken", r.taken) else putNull("taken")
                        put("path", r.path)
                        if (r.lat != null) put("lat", r.lat) else putNull("lat")
                        if (r.lon != null) put("lon", r.lon) else putNull("lon")
                        put("root_id", rootId)
                    }
                    val updated = update("photo", data, "id = ?", arrayOf(r.id))
                    if (updated == 0) {
                        val insert = ContentValues(data).apply {
                            put("id", r.id)
                            if (r.place != null) put("place", r.place) else putNull("place")
                        }
                        insertWithOnConflict("photo", null, insert, SQLiteDatabase.CONFLICT_REPLACE)
                    }
                }
                setTransactionSuccessful()
            } finally {
                endTransaction()
            }
        }
    }

    fun deleteIds(ids: List<String>) {
        if (ids.isEmpty()) return
        with(writableDatabase) {
            beginTransaction()
            try {
                val stmt = compileStatement("DELETE FROM photo WHERE id = ?")
                for (id in ids) {
                    stmt.bindString(1, id)
                    stmt.executeUpdateDelete()
                }
                setTransactionSuccessful()
            } finally {
                endTransaction()
            }
        }
    }

    fun count(rootId: String): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM photo WHERE root_id = ?", arrayOf(rootId)).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }

    fun allIds(rootId: String): List<String> {
        val ids = ArrayList<String>()
        readableDatabase.rawQuery("SELECT id FROM photo WHERE root_id = ?", arrayOf(rootId)).use {
            while (it.moveToNext()) ids.add(it.getString(0))
        }
        return ids
    }

    fun get(id: String): PhotoRow? {
        readableDatabase.rawQuery("SELECT $PHOTO_COLS FROM photo WHERE id = ?", arrayOf(id)).use {
            return if (it.moveToFirst()) it.toPhotoRow() else null
        }
    }

    fun allPhotos(rootId: String): List<PhotoRow> {
        val out = ArrayList<PhotoRow>()
        readableDatabase.rawQuery("SELECT $PHOTO_COLS FROM photo WHERE root_id = ?", arrayOf(rootId)).use {
            while (it.moveToNext()) out.add(it.toPhotoRow())
        }
        return out
    }

    /** Foto's (in map [rootId]) met GPS maar nog zonder geocodet [PhotoRow.place]. */
    fun photosNeedingPlace(rootId: String): List<PhotoRow> {
        val out = ArrayList<PhotoRow>()
        readableDatabase.rawQuery(
            "SELECT $PHOTO_COLS FROM photo WHERE root_id = ? AND lat IS NOT NULL AND lon IS NOT NULL AND place IS NULL",
            arrayOf(rootId),
        ).use { while (it.moveToNext()) out.add(it.toPhotoRow()) }
        return out
    }

    fun updatePlace(id: String, place: String?) {
        val cv = ContentValues().apply { if (place != null) put("place", place) else putNull("place") }
        writableDatabase.update("photo", cv, "id = ?", arrayOf(id))
    }

    private fun Cursor.toPhotoRow() = PhotoRow(
        id = getString(0),
        name = getString(1),
        event = getString(2),
        year = if (isNull(3)) null else getInt(3),
        description = if (isNull(4)) null else getString(4),
        taken = if (isNull(5)) null else getString(5),
        path = getString(6),
        lat = if (isNull(7)) null else getDouble(7),
        lon = if (isNull(8)) null else getDouble(8),
        place = if (isNull(9)) null else getString(9),
    )

    fun getMeta(key: String): String? =
        readableDatabase.rawQuery("SELECT v FROM meta WHERE k = ?", arrayOf(key)).use {
            if (it.moveToFirst()) it.getString(0) else null
        }

    fun setMeta(key: String, value: String?) {
        val cv = ContentValues().apply { put("k", key); put("v", value) }
        writableDatabase.insertWithOnConflict("meta", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    // Delta-token per map.
    fun deltaLinkFor(rootId: String): String? = getMeta("delta_link:$rootId")
    fun setDeltaLink(rootId: String, value: String?) = setMeta("delta_link:$rootId", value)

    /** Alles wissen (bij loskoppelen). Wisselen van map doet dit níét meer. */
    fun clearAll() {
        with(writableDatabase) {
            execSQL("DELETE FROM photo")
            execSQL("DELETE FROM meta")
        }
    }

    private companion object {
        const val PHOTO_COLS = "id,name,event,year,description,taken,path,lat,lon,place"
    }
}
