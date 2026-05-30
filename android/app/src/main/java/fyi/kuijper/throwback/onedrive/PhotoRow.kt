package fyi.kuijper.throwback.onedrive

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Eén geïndexeerde foto — tegelijk het domeinmodel (Graph-parser → slideshow) én de Room-rij. We
 * houden bewust één model i.p.v. een aparte entity + mapper: de foto stroomt ongewijzigd van crawl
 * naar index naar show. [lat]/[lon] = GPS uit de fotometadata, indien aanwezig; [place] = bij het
 * indexeren reverse-geocodet plaats-label (zie [PlaceResolver]); null = (nog) geen.
 *
 * [rootId] is de map waaronder de foto geïndexeerd staat (de index is per gekozen map). De crawl
 * levert 'm als null; de DAO stempelt 'm bij het opslaan (zie [fyi.kuijper.throwback.db.PhotoDao]).
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
