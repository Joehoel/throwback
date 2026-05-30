package fyi.kuijper.throwback.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import fyi.kuijper.throwback.onedrive.PhotoRow

/**
 * De lokale index (zie ADR-0004). Room beheert schema + migraties: bij een schemawijziging bump je
 * [version] en voeg je een `@AutoMigration` toe — Room genereert de SQL uit de geëxporteerde schema's
 * (zie `app/schemas`) en draait 'm zelf bij het openen. Geen handmatige versie-detectie meer.
 *
 * De index is een herbouwbare cache (OneDrive is de bron van waarheid, ADR-0001), dus voor het zeldzame
 * geval dat een migratie ontbreekt valt Room terug op opnieuw opbouwen i.p.v. crashen — één re-crawl.
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
