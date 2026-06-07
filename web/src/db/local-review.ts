import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { ReviewStatus } from "#/domains/shared/photo.ts";

/**
 * Local review-status persistence (ADR-0019). For the File System Access curation
 * path the photo *metadata* lives in the file; only the review bookkeeping
 * (needs_review / handled / skipped) lives in D1, keyed by the photo's local
 * (relative) path. Repo = a module of Effects requiring `SqlClient` (the D1 layer
 * at runtime, a miniflare layer in tests), mirroring `photo-index.ts`.
 */

/** D1 row <-> {path, reviewStatus} codec (snake_case column). */
export const ReviewRow = Schema.Struct({
  path: Schema.String,
  reviewStatus: ReviewStatus,
}).pipe(Schema.encodeKeys({ reviewStatus: "review_status" }));

/** Upsert the review state for a local path. */
export const setReviewStatus = (path: string, status: ReviewStatus) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO local_review (path, review_status) VALUES (${path}, ${status})
      ON CONFLICT(path) DO UPDATE SET review_status = excluded.review_status
    `;
  });

/** The review state for a local path; `needs_review` when not yet recorded. */
export const getReviewStatus = (path: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql`SELECT * FROM local_review WHERE path = ${path}`;
    if (rows.length === 0) {
      return "needs_review" as const;
    }
    const row = yield* Schema.decodeUnknownEffect(ReviewRow)(rows[0]);
    return row.reviewStatus;
  });

/** Every recorded review state — for the curation to hydrate the crawled photos. */
export const reviewStatuses = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql`SELECT * FROM local_review`;
    return yield* Schema.decodeUnknownEffect(Schema.Array(ReviewRow))(rows);
  });
