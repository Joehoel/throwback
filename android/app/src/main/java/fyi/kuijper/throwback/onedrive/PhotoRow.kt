package fyi.kuijper.throwback.onedrive

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One indexed photo — both the domain model (Graph parser -> slideshow) and the Room row. Deliberately
 * a single model instead of a separate entity + mapper, since the photo flows unchanged from crawl to
 * index to show. [place] is the reverse-geocoded label filled in during indexing (see [PlaceResolver]).
 *
 * [rootId] is the folder the photo is indexed under (the index is per chosen folder). The crawl leaves
 * it null; the DAO stamps it on save (see [fyi.kuijper.throwback.db.PhotoDao]).
 */
@Entity(tableName = "photo", indices = [Index("rootId")])
data class PhotoRow(
    @PrimaryKey val id: String,
    val name: String,
    val event: String,
    val year: Int?,
    val description: String?,
    val taken: String?,
    val path: String,
    val lat: Double? = null,
    val lon: Double? = null,
    val place: String? = null,
    val rootId: String? = null,
)
