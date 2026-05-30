package fyi.kuijper.throwback.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Key-value-opslag voor de index-metadata: delta-tokens per map en de reconcile-vlag. */
@Entity(tableName = "meta")
data class MetaEntity(
    @PrimaryKey val k: String,
    val v: String?,
)
