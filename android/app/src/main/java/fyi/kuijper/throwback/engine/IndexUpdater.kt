package fyi.kuijper.throwback.engine

import fyi.kuijper.throwback.db.PhotoDao
import fyi.kuijper.throwback.onedrive.GraphSync
import fyi.kuijper.throwback.onedrive.PhotoRow
import fyi.kuijper.throwback.onedrive.PlaceResolver

/**
 * Applies crawl/delta results to the local index and keeps the running Fotoshow + place labels in
 * sync. [SyncEngine] decides *when* to crawl vs. refresh; this owns *what happens* when photos land:
 * persist them (via [PhotoDao]), push the additions/removals into the [SlideshowEngine]
 * ([onAdded]/[onRemoved]), and reverse-geocode (via [PlaceResolver]).
 *
 * Geocoding is kept off the crawl critical path (ADR-0004): [store] only persists + reveals, and the
 * crawl geocodes once afterwards with [geocodePending]. [apply] (delta) geocodes the changed items
 * inline, since a delta carries only a handful.
 */
class IndexUpdater(
    private val db: PhotoDao,
    private val places: PlaceResolver,
    private val onAdded: (List<String>) -> Unit = {},
    private val onRemoved: (List<String>) -> Unit = {},
) {
    /** A crawl batch: persist the rows and reveal them in the show. No geocoding (kept off the path). */
    suspend fun store(folderId: String, rows: List<PhotoRow>) {
        if (rows.isEmpty()) return
        db.upsertAll(folderId, rows)
        onAdded(rows.map { it.id })
    }

    /** Delta changes: apply deletions + upserts, sync the show, and geocode the (few) changed items. */
    suspend fun apply(folderId: String, changes: GraphSync.Changes) {
        if (changes.deletedIds.isNotEmpty()) {
            db.deleteIds(changes.deletedIds)
            onRemoved(changes.deletedIds)
        }
        if (changes.upserts.isNotEmpty()) {
            db.upsertAll(folderId, changes.upserts)
            onAdded(changes.upserts.map { it.id })
            geocode(changes.upserts)
        }
    }

    /** Reverse-geocode any indexed photos in [folderId] that still lack a place label. */
    suspend fun geocodePending(folderId: String) = geocode(db.photosNeedingPlace(folderId))

    private suspend fun geocode(rows: List<PhotoRow>) {
        val labels = places.resolve(rows)
        if (labels.isNotEmpty()) db.updatePlaces(labels)
    }

    /** Total photos indexed under [folderId] (the count the UI shows). */
    suspend fun count(folderId: String): Int = db.count(folderId)
}
