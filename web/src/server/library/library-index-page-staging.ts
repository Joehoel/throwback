import { Option, Predicate } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import type {
  DriveDeltaPage,
  GraphDeltaLink,
  IndexRunId,
  IndexWorkflowInstanceId,
  LibraryIndexRun,
} from "./library-index-model.ts";

export interface StageLibraryIndexPage {
  readonly runId: IndexRunId;
  readonly workflowInstanceId: IndexWorkflowInstanceId;
  readonly expectedNextLink: Option.Option<GraphDeltaLink>;
  readonly page: DriveDeltaPage;
}

/** Build one atomic D1 batch for a cursor-guarded staging page and its checkpoint. */
export function libraryIndexPageStatements(
  sql: SqlClient.SqlClient,
  run: LibraryIndexRun,
  input: StageLibraryIndexPage,
) {
  const stagedItems = JSON.stringify(
    input.page.items.map((item) => ({
      id: item.id,
      parentId: Option.getOrNull(item.parentId),
      nodeType: item.nodeType,
      tombstone: item.tombstone,
    })),
  );

  const expectedCursor = Option.getOrNull(input.expectedNextLink);

  const upsertItems = sql`
    INSERT INTO "drive_item_generation" (
      "libraryId", "generation", "itemId", "parentItemId", "nodeType", "tombstone"
    )
    SELECT
      ${run.libraryId},
      ${run.generation},
      json_extract("item"."value", '$.id'),
      json_extract("item"."value", '$.parentId'),
      json_extract("item"."value", '$.nodeType'),
      json_extract("item"."value", '$.tombstone')
    FROM json_each(${stagedItems}) AS "item"
    WHERE EXISTS (
      SELECT 1
      FROM "library_index_run" AS "currentRun"
      WHERE "currentRun"."runId" = ${input.runId}
        AND "currentRun"."workflowInstanceId" = ${input.workflowInstanceId}
        AND "currentRun"."status" = 'running'
        AND (
          ("currentRun"."nextLink" IS NULL AND ${expectedCursor} IS NULL)
          OR "currentRun"."nextLink" = ${expectedCursor}
        )
    )
    ON CONFLICT("libraryId", "generation", "itemId") DO UPDATE SET
      "parentItemId" = excluded."parentItemId",
      "nodeType" = excluded."nodeType",
      "tombstone" = excluded."tombstone"
  `;

  const checkpoint = Predicate.isTagged("Next")(input.page.continuation)
    ? sql`
        UPDATE "library_index_run"
        SET
          "nextLink" = ${input.page.continuation.link},
          "pagesProcessed" = "pagesProcessed" + 1,
          "processedItems" = "processedItems" + ${input.page.items.length},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${input.runId}
          AND "workflowInstanceId" = ${input.workflowInstanceId}
          AND "status" = 'running'
          AND (
            ("nextLink" IS NULL AND ${expectedCursor} IS NULL)
            OR "nextLink" = ${expectedCursor}
          )
      `
    : sql`
        UPDATE "library_index_run"
        SET
          "status" = 'active',
          "nextLink" = NULL,
          "deltaLink" = ${input.page.continuation.link},
          "activeGeneration" = "generation",
          "pagesProcessed" = "pagesProcessed" + 1,
          "processedItems" = "processedItems" + ${input.page.items.length},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${input.runId}
          AND "workflowInstanceId" = ${input.workflowInstanceId}
          AND "status" = 'running'
          AND (
            ("nextLink" IS NULL AND ${expectedCursor} IS NULL)
            OR "nextLink" = ${expectedCursor}
          )
      `;

  return [upsertItems, checkpoint];
}
