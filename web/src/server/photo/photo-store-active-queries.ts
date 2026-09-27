import { SqlSchema } from "effect/unstable/sql";
import type { SqlClient } from "effect/unstable/sql";
import { LibraryId } from "../library/model.ts";
import { PhotoResource } from "./model.ts";
import { StoredReviewablePhoto } from "./photo-storage-schema.ts";

/** Build active-generation Foto lookups while keeping table layout inside persistence. */
export function photoStoreActiveQueries(sql: SqlClient.SqlClient) {
  const findFirstReviewable = SqlSchema.findOneOption({
    Request: LibraryId,
    Result: StoredReviewablePhoto,
    execute: (libraryId) => sql`
      SELECT
        "photo"."libraryId",
        "photo"."eventId",
        "photo"."photoId",
        "photo"."fileName",
        "photo"."description",
        "photo"."latitude",
        "photo"."longitude",
        "photo"."orientation",
        "photo"."cTag",
        "photo"."eTag",
        "photo"."projectionRevision"
      FROM "photo_generation" AS "photo"
      JOIN "library_index_run" AS "run"
        ON "run"."libraryId" = "photo"."libraryId"
       AND "run"."activeGeneration" = "photo"."generation"
      WHERE "photo"."libraryId" = ${libraryId}
        AND "photo"."reviewability" = 'eligible'
      ORDER BY "photo"."eventId", "photo"."photoId"
      LIMIT 1
    `,
  });

  const findReviewable = SqlSchema.findOneOption({
    Request: PhotoResource,
    Result: StoredReviewablePhoto,
    execute: (resource) => sql`
      SELECT
        "photo"."libraryId",
        "photo"."eventId",
        "photo"."photoId",
        "photo"."fileName",
        "photo"."description",
        "photo"."latitude",
        "photo"."longitude",
        "photo"."orientation",
        "photo"."cTag",
        "photo"."eTag",
        "photo"."projectionRevision"
      FROM "photo_generation" AS "photo"
      JOIN "library_index_run" AS "run"
        ON "run"."libraryId" = "photo"."libraryId"
       AND "run"."activeGeneration" = "photo"."generation"
      WHERE "photo"."libraryId" = ${resource.libraryId}
        AND "photo"."eventId" = ${resource.eventId}
        AND "photo"."photoId" = ${resource.photoId}
        AND "photo"."reviewability" = 'eligible'
    `,
  });

  return { findFirstReviewable, findReviewable };
}
