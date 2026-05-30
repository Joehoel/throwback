package fyi.kuijper.throwback.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import fyi.kuijper.throwback.onedrive.PhotoRow

/**
 * The local index (see ADR-0004). Room manages schema + migrations: on a schema change bump [version]
 * and add an `@AutoMigration` — Room generates the SQL from the exported schemas (see `app/schemas`).
 *
 * The index is a rebuildable cache (OneDrive is the source of truth, ADR-0001), so on the rare missing
 * migration Room falls back to rebuilding instead of crashing — one re-crawl.
 */
@Database(entities = [PhotoRow::class, MetaEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun photoDao(): PhotoDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "throwback.db")
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
    }
}
