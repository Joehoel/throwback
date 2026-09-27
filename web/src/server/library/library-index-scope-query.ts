import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import { SqlSchema } from "effect/unstable/sql";
import { LibraryIndexUnavailable } from "./errors.ts";
import {
  ContainsActiveItemRequest,
  StoredContainsActiveItem,
} from "./library-index-storage-schema.ts";
import type { DriveItemId, LibraryId } from "./model.ts";
import { retryInteractiveSql } from "../sql-retry.ts";

function unavailable(): LibraryIndexUnavailable {
  return new LibraryIndexUnavailable({
    message: "De actieve Bibliotheek-scope kan nu niet veilig worden gecontroleerd.",
  });
}

/** Build the item-id ancestry query against the currently active generation. */
export function containsActiveItemQuery(sql: SqlClient.SqlClient) {
  const containsActive = SqlSchema.findOne({
    Request: ContainsActiveItemRequest,
    Result: StoredContainsActiveItem,
    execute: ({ itemId, libraryId }) => sql`
      WITH RECURSIVE "ancestors" ("itemId", "parentItemId") AS (
        SELECT "items"."itemId", "items"."parentItemId"
        FROM "drive_item_generation" AS "items"
        JOIN "library_index_run" AS "run"
          ON "run"."libraryId" = "items"."libraryId"
         AND "run"."activeGeneration" = "items"."generation"
        WHERE "items"."libraryId" = ${libraryId}
          AND "items"."itemId" = ${itemId}
          AND "items"."tombstone" = 0

        UNION

        SELECT "parent"."itemId", "parent"."parentItemId"
        FROM "drive_item_generation" AS "parent"
        JOIN "ancestors" AS "child" ON "child"."parentItemId" = "parent"."itemId"
        JOIN "library_index_run" AS "run"
          ON "run"."libraryId" = "parent"."libraryId"
         AND "run"."activeGeneration" = "parent"."generation"
        WHERE "parent"."libraryId" = ${libraryId}
          AND "parent"."tombstone" = 0
      )
      SELECT EXISTS (
        SELECT 1
        FROM "ancestors"
        JOIN "library" ON "library"."id" = ${libraryId}
        WHERE "ancestors"."itemId" = "library"."rootDriveItemId"
      ) AS "containsItem"
    `,
  });

  return Effect.fn("LibraryIndexStore.containsActiveItem")(function* (
    libraryId: LibraryId,
    itemId: DriveItemId,
  ) {
    return yield* retryInteractiveSql(containsActive({ libraryId, itemId })).pipe(
      Effect.mapError(unavailable),
    );
  });
}
