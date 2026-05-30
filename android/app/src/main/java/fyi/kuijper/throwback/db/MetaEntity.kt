package fyi.kuijper.throwback.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Key-value store for index metadata: per-folder delta tokens and the reconcile flag. */
@Entity(tableName = "meta")
data class MetaEntity(
    @PrimaryKey val k: String,
    val v: String?,
)
