package fyi.kuijper.throwback.onedrive

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Eén geïndexeerde foto uit de bibliotheek. */
data class PhotoRow(
    val id: String,
    val name: String,
    val event: String,
    val year: Int?,
    val description: String?,
    val taken: String?,
    val path: String,
)

/**
 * Lokale index (bron van waarheid voor de show), zie ADR-0004.
 * Handgeschreven SQLite i.p.v. Room — zelfde rol, geen KSP/annotation-processing.
 * Alle calls horen op een achtergrond-thread te draaien (ViewModel doet dat via IO).
 */
class PhotoDb(context: Context) : SQLiteOpenHelper(context.applicationContext, "throwback.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE photo (" +
                "id TEXT PRIMARY KEY, name TEXT, event TEXT, year INTEGER, " +
                "description TEXT, taken TEXT, path TEXT)"
        )
        db.execSQL("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS photo")
        db.execSQL("DROP TABLE IF EXISTS meta")
        onCreate(db)
    }

    fun upsertAll(rows: List<PhotoRow>) {
        if (rows.isEmpty()) return
        with(writableDatabase) {
            beginTransaction()
            try {
                for (r in rows) {
                    val cv = ContentValues().apply {
                        put("id", r.id)
                        put("name", r.name)
                        put("event", r.event)
                        if (r.year != null) put("year", r.year) else putNull("year")
                        if (r.description != null) put("description", r.description) else putNull("description")
                        if (r.taken != null) put("taken", r.taken) else putNull("taken")
                        put("path", r.path)
                    }
                    insertWithOnConflict("photo", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
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

    fun count(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM photo", null).use {
        if (it.moveToFirst()) it.getInt(0) else 0
    }

    fun countWithDescription(): Int = readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM photo WHERE description IS NOT NULL AND description <> ''", null
    ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

    fun allIds(): List<String> {
        val ids = ArrayList<String>()
        readableDatabase.rawQuery("SELECT id FROM photo", null).use {
            while (it.moveToNext()) ids.add(it.getString(0))
        }
        return ids
    }

    fun get(id: String): PhotoRow? {
        readableDatabase.rawQuery(
            "SELECT id,name,event,year,description,taken,path FROM photo WHERE id = ?",
            arrayOf(id),
        ).use {
            if (!it.moveToFirst()) return null
            return PhotoRow(
                id = it.getString(0),
                name = it.getString(1),
                event = it.getString(2),
                year = if (it.isNull(3)) null else it.getInt(3),
                description = if (it.isNull(4)) null else it.getString(4),
                taken = if (it.isNull(5)) null else it.getString(5),
                path = it.getString(6),
            )
        }
    }

    fun allPhotos(): List<PhotoRow> {
        val out = ArrayList<PhotoRow>()
        readableDatabase.rawQuery(
            "SELECT id,name,event,year,description,taken,path FROM photo", null,
        ).use {
            while (it.moveToNext()) {
                out.add(
                    PhotoRow(
                        id = it.getString(0),
                        name = it.getString(1),
                        event = it.getString(2),
                        year = if (it.isNull(3)) null else it.getInt(3),
                        description = if (it.isNull(4)) null else it.getString(4),
                        taken = if (it.isNull(5)) null else it.getString(5),
                        path = it.getString(6),
                    )
                )
            }
        }
        return out
    }

    var deltaLink: String?
        get() = readableDatabase.rawQuery("SELECT v FROM meta WHERE k = 'delta_link'", null).use {
            if (it.moveToFirst()) it.getString(0) else null
        }
        set(value) {
            val cv = ContentValues().apply {
                put("k", "delta_link")
                put("v", value)
            }
            writableDatabase.insertWithOnConflict("meta", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        }

    /** Wis index + deltaLink (bv. bij een andere gekozen map). */
    fun clearIndex() {
        with(writableDatabase) {
            execSQL("DELETE FROM photo")
            execSQL("DELETE FROM meta")
        }
    }
}
