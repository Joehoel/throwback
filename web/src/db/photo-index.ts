import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { DriveItemId } from "#/domain/ids.ts";
import { Description, Location, type Photo, ReviewStatus } from "#/domain/photo.ts";

/**
 * Photo index persistence (ADR-0009). Repo = a module of Effects that require the
 * `SqlClient` (provided by the D1 layer — `db/client.ts` at runtime, a miniflare
 * layer in tests). See docs/design/domain-model.md §4.
 */

/** D1 row <-> Photo codec. `NullOr` ↔ nullable column; `encodeKeys` for snake_case. */
export const PhotoFromRow = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  year: Schema.NullOr(Schema.Int),
  description: Schema.NullOr(Description),
  location: Schema.NullOr(Schema.fromJsonString(Location)),
  folderId: DriveItemId,
  mimeType: Schema.String,
  reviewStatus: ReviewStatus,
}).pipe(
  Schema.encodeKeys({ folderId: "folder_id", mimeType: "mime_type", reviewStatus: "review_status" }),
);

export type ReviewFilter = "missing_description" | "missing_location" | "any";

/**
 * Upsert a crawled photo. On re-crawl, content columns are refreshed from OneDrive
 * but `review_status` is preserved (ADR-0009: re-sync keeps handled/skipped).
 */
export const upsert = (photo: Photo) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const r = yield* Schema.encodeEffect(PhotoFromRow)(photo);
    yield* sql`
      INSERT INTO photo_index (id, folder_id, name, year, mime_type, description, location, review_status)
      VALUES (${r.id}, ${r.folder_id}, ${r.name}, ${r.year}, ${r.mime_type}, ${r.description}, ${r.location}, ${r.review_status})
      ON CONFLICT(id) DO UPDATE SET
        folder_id = excluded.folder_id, name = excluded.name, year = excluded.year,
        mime_type = excluded.mime_type, description = excluded.description, location = excluded.location
    `;
  });

/** The next photo still needing review for the given filter, or null. */
export const reviewNext = (filter: ReviewFilter) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows =
      filter === "missing_description"
        ? yield* sql`SELECT * FROM photo_index WHERE description IS NULL AND review_status = 'needs_review' ORDER BY id LIMIT 1`
        : filter === "missing_location"
          ? yield* sql`SELECT * FROM photo_index WHERE location IS NULL AND review_status = 'needs_review' ORDER BY id LIMIT 1`
          : yield* sql`SELECT * FROM photo_index WHERE review_status = 'needs_review' ORDER BY id LIMIT 1`;
    if (rows.length === 0) return null;
    return yield* Schema.decodeUnknownEffect(PhotoFromRow)(rows[0]);
  });

/** Mark a photo handled/skipped after an approval or skip. */
export const setReviewStatus = (id: DriveItemId, status: ReviewStatus) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE photo_index SET review_status = ${status} WHERE id = ${id}`;
  });
