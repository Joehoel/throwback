import { D1Client } from "@effect/sql-d1/D1Client";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import type { GraphConnectionVersion } from "../curator/model.ts";
import { LibraryIndexUnavailable } from "./errors.ts";
import type {
  IndexRunId,
  IndexWorkflowInstanceId,
  LibraryIndexRun,
} from "./library-index-model.ts";
import { IndexRunId as IndexRunIdSchema } from "./library-index-model.ts";
import {
  containsActiveItemQuery,
  libraryIndexPageStatements,
} from "./library-index-persistence.ts";
import type { StageLibraryIndexPage } from "./library-index-persistence.ts";
import type { DriveItemId, LibraryBoundary, LibraryId } from "./model.ts";
import { LibraryId as LibraryIdSchema } from "./model.ts";
import { StoredLibraryIndexRun } from "./library-index-storage-schema.ts";
import { retryBackgroundSql, retryInteractiveSql } from "../sql-retry.ts";

/** D1 authority for one staged, singleton Bibliotheek enumeration. */
export interface LibraryIndexStoreService {
  readonly ensureInitialRun: (
    library: LibraryBoundary,
    proposedRunId: IndexRunId,
    graphConnectionVersion: GraphConnectionVersion,
  ) => Effect.Effect<LibraryIndexRun, LibraryIndexUnavailable>;
  readonly getRun: (
    libraryId: LibraryId,
  ) => Effect.Effect<Option.Option<LibraryIndexRun>, LibraryIndexUnavailable>;
  readonly getRunForCheckpoint: (
    libraryId: LibraryId,
  ) => Effect.Effect<Option.Option<LibraryIndexRun>, LibraryIndexUnavailable>;
  readonly reserveDispatchAttempt: (
    runId: IndexRunId,
    proposedWorkflowInstanceId: IndexWorkflowInstanceId,
    graphConnectionVersion: GraphConnectionVersion,
  ) => Effect.Effect<LibraryIndexRun, LibraryIndexUnavailable>;
  readonly claimRun: (
    runId: IndexRunId,
    workflowInstanceId: IndexWorkflowInstanceId,
  ) => Effect.Effect<boolean, LibraryIndexUnavailable>;
  readonly stagePage: (
    input: StageLibraryIndexPage,
  ) => Effect.Effect<LibraryIndexRun, LibraryIndexUnavailable>;
  readonly containsActiveItem: (
    libraryId: LibraryId,
    itemId: DriveItemId,
  ) => Effect.Effect<boolean, LibraryIndexUnavailable>;
  readonly markWaitingForReauthentication: (
    runId: IndexRunId,
    workflowInstanceId: IndexWorkflowInstanceId,
    graphConnectionVersion: GraphConnectionVersion,
  ) => Effect.Effect<void, LibraryIndexUnavailable>;
  readonly markRetrying: (
    runId: IndexRunId,
    workflowInstanceId: IndexWorkflowInstanceId,
  ) => Effect.Effect<void, LibraryIndexUnavailable>;
  readonly markFailed: (
    runId: IndexRunId,
    workflowInstanceId: IndexWorkflowInstanceId,
  ) => Effect.Effect<void, LibraryIndexUnavailable>;
}

/** D1 authority for one staged, singleton Bibliotheek enumeration. */
export class LibraryIndexStore extends Context.Service<
  LibraryIndexStore,
  LibraryIndexStoreService
>()("throwback/library/LibraryIndexStore") {}

function unavailable(): LibraryIndexUnavailable {
  return new LibraryIndexUnavailable({
    message: "De Bibliotheek-index kan nu niet veilig worden bijgewerkt.",
  });
}

/** Effect SQL D1 implementation of staged Graph-delta persistence and activation. */
export const LibraryIndexStoreLive = Layer.effect(
  LibraryIndexStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const d1 = yield* D1Client;

    const findRun = SqlSchema.findOneOption({
      Request: LibraryIdSchema,
      Result: StoredLibraryIndexRun,
      execute: (libraryId) => sql`
        SELECT
          "libraryId",
          "runId",
          "generation",
          "status",
          "workflowInstanceId",
          "graphConnectionVersion",
          "nextLink",
          "pendingDeltaLink",
          "deltaLink",
          "activeGeneration",
          "pagesProcessed",
          "processedItems"
        FROM "library_index_run"
        WHERE "libraryId" = ${libraryId}
      `,
    });

    const findRunById = SqlSchema.findOneOption({
      Request: IndexRunIdSchema,
      Result: StoredLibraryIndexRun,
      execute: (runId) => sql`
        SELECT
          "libraryId",
          "runId",
          "generation",
          "status",
          "workflowInstanceId",
          "graphConnectionVersion",
          "nextLink",
          "pendingDeltaLink",
          "deltaLink",
          "activeGeneration",
          "pagesProcessed",
          "processedItems"
        FROM "library_index_run"
        WHERE "runId" = ${runId}
      `,
    });

    const getRun = Effect.fn("LibraryIndexStore.getRun")(function* (libraryId: LibraryId) {
      return yield* retryInteractiveSql(findRun(libraryId)).pipe(Effect.mapError(unavailable));
    });

    const getRunForCheckpoint = Effect.fn("LibraryIndexStore.getRunForCheckpoint")(function* (
      libraryId: LibraryId,
    ) {
      return yield* retryBackgroundSql(findRun(libraryId)).pipe(Effect.mapError(unavailable));
    });

    const getRunByIdInteractive = Effect.fnUntraced(function* (runId: IndexRunId) {
      return yield* retryInteractiveSql(findRunById(runId)).pipe(Effect.mapError(unavailable));
    });

    const getRunByIdForCheckpoint = Effect.fnUntraced(function* (runId: IndexRunId) {
      return yield* retryBackgroundSql(findRunById(runId)).pipe(Effect.mapError(unavailable));
    });

    const ensureInitialRun = Effect.fn("LibraryIndexStore.ensureInitialRun")(function* (
      library: LibraryBoundary,
      proposedRunId: IndexRunId,
      graphConnectionVersion: GraphConnectionVersion,
    ) {
      yield* retryInteractiveSql(sql`
        INSERT INTO "library_index_run" (
          "libraryId", "runId", "generation", "status", "graphConnectionVersion"
        ) VALUES (
          ${library.id}, ${proposedRunId}, 1, 'queued', ${graphConnectionVersion}
        )
        ON CONFLICT("libraryId") DO NOTHING
      `).pipe(Effect.mapError(unavailable));

      const run = yield* getRun(library.id);

      return yield* Option.match(run, {
        onNone: unavailable,
        onSome: Effect.succeed,
      });
    });

    const reserveDispatchAttempt = Effect.fn("LibraryIndexStore.reserveDispatchAttempt")(function* (
      runId: IndexRunId,
      proposedWorkflowInstanceId: IndexWorkflowInstanceId,
      graphConnectionVersion: GraphConnectionVersion,
    ) {
      yield* retryInteractiveSql(sql`
          UPDATE "library_index_run"
          SET
            "workflowInstanceId" = ${proposedWorkflowInstanceId},
            "graphConnectionVersion" = ${graphConnectionVersion},
            "status" = 'queued',
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "runId" = ${runId}
            AND (
              ("status" = 'queued' AND "workflowInstanceId" IS NULL)
              OR (
                "status" = 'waiting_for_reauthentication'
                AND "graphConnectionVersion" <> ${graphConnectionVersion}
              )
            )
        `).pipe(Effect.mapError(unavailable));

      const reserved = yield* getRunByIdInteractive(runId);

      return yield* Option.match(reserved, {
        onNone: unavailable,
        onSome: Effect.succeed,
      });
    });

    const claimRun = Effect.fn("LibraryIndexStore.claimRun")(function* (
      runId: IndexRunId,
      workflowInstanceId: IndexWorkflowInstanceId,
    ) {
      yield* retryBackgroundSql(sql`
        UPDATE "library_index_run"
        SET
          "status" = 'running',
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${runId}
          AND "status" IN ('queued', 'running', 'retrying')
          AND "workflowInstanceId" = ${workflowInstanceId}
      `).pipe(Effect.mapError(unavailable));

      const run = yield* getRunByIdForCheckpoint(runId);

      return Option.exists(
        run,
        (current) =>
          current.status === "running" &&
          Option.contains(current.workflowInstanceId, workflowInstanceId),
      );
    });

    const stagePage = Effect.fn("LibraryIndexStore.stagePage")(function* (
      input: StageLibraryIndexPage,
    ) {
      const runOption = yield* getRunByIdForCheckpoint(input.runId);

      const run = yield* Option.match(runOption, {
        onNone: unavailable,
        onSome: Effect.succeed,
      });

      if (
        run.status !== "running" ||
        !Option.contains(run.workflowInstanceId, input.workflowInstanceId)
      ) {
        return yield* unavailable();
      }

      yield* retryBackgroundSql(d1.batch(libraryIndexPageStatements(sql, run, input))).pipe(
        Effect.mapError(unavailable),
      );

      const checkpointed = yield* getRunByIdForCheckpoint(input.runId);

      return yield* Option.match(checkpointed, {
        onNone: unavailable,
        onSome: Effect.succeed,
      });
    });

    const containsActiveItem = containsActiveItemQuery(sql);

    const markStatus = Effect.fnUntraced(function* (
      runId: IndexRunId,
      workflowInstanceId: IndexWorkflowInstanceId,
      status: "retrying" | "waiting_for_reauthentication",
    ) {
      yield* retryBackgroundSql(sql`
        UPDATE "library_index_run"
        SET "status" = ${status}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${runId}
          AND "workflowInstanceId" = ${workflowInstanceId}
          AND "status" <> 'active'
      `).pipe(Effect.mapError(unavailable));
    });

    const markWaitingForReauthentication = Effect.fn(
      "LibraryIndexStore.markWaitingForReauthentication",
    )(function* (
      runId: IndexRunId,
      workflowInstanceId: IndexWorkflowInstanceId,
      graphConnectionVersion: GraphConnectionVersion,
    ) {
      yield* retryBackgroundSql(sql`
        UPDATE "library_index_run"
        SET
          "status" = 'waiting_for_reauthentication',
          "graphConnectionVersion" = ${graphConnectionVersion},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${runId}
          AND "workflowInstanceId" = ${workflowInstanceId}
          AND "status" <> 'active'
      `).pipe(Effect.mapError(unavailable));
    });

    const markRetrying = Effect.fn("LibraryIndexStore.markRetrying")(function* (
      runId: IndexRunId,
      workflowInstanceId: IndexWorkflowInstanceId,
    ) {
      yield* markStatus(runId, workflowInstanceId, "retrying");
    });

    const markFailed = Effect.fn("LibraryIndexStore.markFailed")(function* (
      runId: IndexRunId,
      workflowInstanceId: IndexWorkflowInstanceId,
    ) {
      yield* retryBackgroundSql(sql`
        UPDATE "library_index_run"
        SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "runId" = ${runId}
          AND "workflowInstanceId" = ${workflowInstanceId}
          AND "status" <> 'active'
      `).pipe(Effect.mapError(unavailable));
    });

    return LibraryIndexStore.of({
      claimRun,
      containsActiveItem,
      ensureInitialRun,
      getRun,
      getRunForCheckpoint,
      markFailed,
      markRetrying,
      markWaitingForReauthentication,
      reserveDispatchAttempt,
      stagePage,
    });
  }),
);
