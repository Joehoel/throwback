import { Context, Effect, Layer, Option, Predicate, Schedule, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { isSqlError } from "effect/unstable/sql/SqlError";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { IndexRunId, IndexWorkflowInstanceId } from "../library/library-index-model.ts";
import {
  IndexRunId as IndexRunIdSchema,
  IndexWorkflowInstanceId as IndexWorkflowInstanceIdSchema,
} from "../library/library-index-model.ts";
import type { LibraryId } from "../library/model.ts";
import { PhotoProjectionUnavailable } from "./errors.ts";
import type { HydratedFile, Photo, PhotoHydrationCandidate, PhotoResource } from "./model.ts";
import { PhotoHydrationCandidate as PhotoHydrationCandidateSchema } from "./model.ts";
import { photoStoreActiveQueries } from "./photo-store-active-queries.ts";
import { StoredActivation } from "./photo-storage-schema.ts";

/** Identity proving which Workflow may mutate one staged Foto generation. */
export interface PhotoGenerationOwner {
  readonly runId: IndexRunId;
  readonly workflowInstanceId: IndexWorkflowInstanceId;
}

/** D1 authority for staged hydration and active Foto reads. */
export interface PhotoStoreService {
  readonly nextStagedFile: (
    owner: PhotoGenerationOwner,
  ) => Effect.Effect<Option.Option<PhotoHydrationCandidate>, PhotoProjectionUnavailable>;
  readonly stageHydratedFile: (
    owner: PhotoGenerationOwner,
    file: HydratedFile,
  ) => Effect.Effect<void, PhotoProjectionUnavailable>;
  readonly activateHydratedGeneration: (
    owner: PhotoGenerationOwner,
  ) => Effect.Effect<boolean, PhotoProjectionUnavailable>;
  readonly firstReviewablePhoto: (
    libraryId: LibraryId,
  ) => Effect.Effect<Option.Option<Photo>, PhotoProjectionUnavailable>;
  readonly getReviewablePhoto: (
    resource: PhotoResource,
  ) => Effect.Effect<Option.Option<Photo>, PhotoProjectionUnavailable>;
}

/** D1 authority for staged hydration and active Foto reads. */
export class PhotoStore extends Context.Service<PhotoStore, PhotoStoreService>()(
  "throwback/photo/PhotoStore",
) {}

function unavailable(
  operation: "activate" | "read" | "stage",
  sqlError: Option.Option<SqlError>,
): PhotoProjectionUnavailable {
  return new PhotoProjectionUnavailable({
    message: "De Foto-projectie kan nu niet veilig worden gelezen of bijgewerkt.",
    subsystem: "photo-projection",
    operation,
    retryable: Option.exists(sqlError, (error) => error.isRetryable),
  });
}

function retryInteractiveSql<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.exponential("50 millis", 4).pipe(Schedule.jittered),
      while: (error) => isSqlError(error) && error.isRetryable,
    }),
  );
}

function retryBackgroundSql<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.retry({
      times: 4,
      schedule: Schedule.exponential("1 second", 4).pipe(Schedule.jittered),
      while: (error) => isSqlError(error) && error.isRetryable,
    }),
  );
}

/** Effect SQL implementation of staged Foto hydration and atomic publication. */
export const PhotoStoreLive = Layer.effect(
  PhotoStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const { findFirstReviewable, findReviewable } = photoStoreActiveQueries(sql);

    const findNextStagedFile = SqlSchema.findOneOption({
      Request: Schema.Struct({
        runId: IndexRunIdSchema,
        workflowInstanceId: IndexWorkflowInstanceIdSchema,
      }),
      Result: PhotoHydrationCandidateSchema,
      execute: ({ runId, workflowInstanceId }) => sql`
        WITH RECURSIVE "scope" ("itemId") AS (
          SELECT "rootItem"."itemId"
          FROM "library_index_run" AS "run"
          JOIN "library" AS "library" ON "library"."id" = "run"."libraryId"
          JOIN "drive_item_generation" AS "rootItem"
            ON "rootItem"."libraryId" = "run"."libraryId"
           AND "rootItem"."generation" = "run"."generation"
           AND "rootItem"."itemId" = "library"."rootDriveItemId"
           AND "rootItem"."tombstone" = 0
          WHERE "run"."runId" = ${runId}
            AND "run"."workflowInstanceId" = ${workflowInstanceId}
            AND "run"."status" = 'running'
            AND "run"."pendingDeltaLink" IS NOT NULL

          UNION ALL

          SELECT "child"."itemId"
          FROM "drive_item_generation" AS "child"
          JOIN "library_index_run" AS "run"
            ON "run"."libraryId" = "child"."libraryId"
           AND "run"."generation" = "child"."generation"
          JOIN "scope" AS "parent" ON "parent"."itemId" = "child"."parentItemId"
          WHERE "run"."runId" = ${runId}
            AND "child"."tombstone" = 0
        )
        SELECT "file"."itemId" AS "photoId", "file"."parentItemId" AS "eventId"
        FROM "scope"
        JOIN "library_index_run" AS "run" ON "run"."runId" = ${runId}
        JOIN "drive_item_generation" AS "file"
          ON "file"."libraryId" = "run"."libraryId"
         AND "file"."generation" = "run"."generation"
         AND "file"."itemId" = "scope"."itemId"
        LEFT JOIN "photo_generation" AS "hydrated"
          ON "hydrated"."libraryId" = "file"."libraryId"
         AND "hydrated"."generation" = "file"."generation"
         AND "hydrated"."photoId" = "file"."itemId"
        WHERE "file"."nodeType" = 'file'
          AND "file"."parentItemId" IS NOT NULL
          AND "hydrated"."photoId" IS NULL
        ORDER BY "file"."itemId"
        LIMIT 1
      `,
    });

    const nextStagedFile = Effect.fn("PhotoStore.nextStagedFile")(function* (
      owner: PhotoGenerationOwner,
    ) {
      return yield* retryBackgroundSql(findNextStagedFile(owner)).pipe(
        Effect.mapError((error) =>
          unavailable("read", isSqlError(error) ? Option.some(error) : Option.none()),
        ),
      );
    });

    const stageHydratedFile = Effect.fn("PhotoStore.stageHydratedFile")(function* (
      owner: PhotoGenerationOwner,
      file: HydratedFile,
    ) {
      const reviewable = Predicate.isTagged("ReviewablePhoto")(file);

      yield* retryBackgroundSql(sql`
        WITH RECURSIVE "scope" ("itemId") AS (
          SELECT "rootItem"."itemId"
          FROM "library_index_run" AS "scopeRun"
          JOIN "library" AS "library" ON "library"."id" = "scopeRun"."libraryId"
          JOIN "drive_item_generation" AS "rootItem"
            ON "rootItem"."libraryId" = "scopeRun"."libraryId"
           AND "rootItem"."generation" = "scopeRun"."generation"
           AND "rootItem"."itemId" = "library"."rootDriveItemId"
           AND "rootItem"."tombstone" = 0
          WHERE "scopeRun"."runId" = ${owner.runId}

          UNION ALL

          SELECT "child"."itemId"
          FROM "drive_item_generation" AS "child"
          JOIN "library_index_run" AS "scopeRun"
            ON "scopeRun"."libraryId" = "child"."libraryId"
           AND "scopeRun"."generation" = "child"."generation"
          JOIN "scope" AS "parent" ON "parent"."itemId" = "child"."parentItemId"
          WHERE "scopeRun"."runId" = ${owner.runId}
            AND "child"."tombstone" = 0
        )
        INSERT INTO "photo_generation" (
          "libraryId", "generation", "photoId", "eventId", "fileName", "reviewability",
          "cTag", "eTag", "description", "latitude", "longitude", "orientation",
          "projectionRevision"
        )
        SELECT
          "run"."libraryId",
          "run"."generation",
          ${file.photoId},
          ${reviewable ? file.eventId : null},
          ${reviewable ? file.fileName : null},
          ${reviewable ? "eligible" : "not_reviewable"},
          ${reviewable ? file.cTag : null},
          ${reviewable ? file.eTag : null},
          ${reviewable ? file.description : null},
          ${reviewable ? (file.location?.latitude ?? null) : null},
          ${reviewable ? (file.location?.longitude ?? null) : null},
          ${reviewable ? file.orientation : null},
          ${reviewable ? file.projectionRevision : null}
        FROM "library_index_run" AS "run"
        JOIN "scope" ON "scope"."itemId" = ${file.photoId}
        JOIN "drive_item_generation" AS "candidate"
          ON "candidate"."libraryId" = "run"."libraryId"
         AND "candidate"."generation" = "run"."generation"
         AND "candidate"."itemId" = "scope"."itemId"
        WHERE "run"."runId" = ${owner.runId}
          AND "run"."workflowInstanceId" = ${owner.workflowInstanceId}
          AND "run"."status" = 'running'
          AND "run"."pendingDeltaLink" IS NOT NULL
          AND "candidate"."nodeType" = 'file'
          AND (${reviewable ? file.eventId : null} IS NULL
            OR "candidate"."parentItemId" = ${reviewable ? file.eventId : null})
        ON CONFLICT("libraryId", "generation", "photoId") DO NOTHING
      `).pipe(Effect.mapError((error) => unavailable("stage", Option.some(error))));
    });

    const activationStatus = SqlSchema.findOne({
      Request: IndexRunIdSchema,
      Result: StoredActivation,
      execute: (runId) => sql`
        SELECT EXISTS (
          SELECT 1
          FROM "library_index_run"
          WHERE "runId" = ${runId}
            AND "status" = 'active'
            AND "activeGeneration" = "generation"
            AND "pendingDeltaLink" IS NULL
        ) AS "active"
      `,
    });

    const activateHydratedGeneration = Effect.fn("PhotoStore.activateHydratedGeneration")(
      function* (owner: PhotoGenerationOwner) {
        yield* retryBackgroundSql(sql`
          WITH RECURSIVE "scope" ("itemId") AS (
            SELECT "rootItem"."itemId"
            FROM "library_index_run" AS "run"
            JOIN "library" AS "library" ON "library"."id" = "run"."libraryId"
            JOIN "drive_item_generation" AS "rootItem"
              ON "rootItem"."libraryId" = "run"."libraryId"
             AND "rootItem"."generation" = "run"."generation"
             AND "rootItem"."itemId" = "library"."rootDriveItemId"
             AND "rootItem"."tombstone" = 0
            WHERE "run"."runId" = ${owner.runId}

            UNION ALL

            SELECT "child"."itemId"
            FROM "drive_item_generation" AS "child"
            JOIN "library_index_run" AS "run"
              ON "run"."libraryId" = "child"."libraryId"
             AND "run"."generation" = "child"."generation"
            JOIN "scope" AS "parent" ON "parent"."itemId" = "child"."parentItemId"
            WHERE "run"."runId" = ${owner.runId}
              AND "child"."tombstone" = 0
          )
          UPDATE "library_index_run" AS "run"
          SET
            "status" = 'active',
            "deltaLink" = "pendingDeltaLink",
            "pendingDeltaLink" = NULL,
            "activeGeneration" = "generation",
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "run"."runId" = ${owner.runId}
            AND "run"."workflowInstanceId" = ${owner.workflowInstanceId}
            AND "run"."status" = 'running'
            AND "run"."pendingDeltaLink" IS NOT NULL
            AND EXISTS (SELECT 1 FROM "scope")
            AND NOT EXISTS (
              SELECT 1
              FROM "scope"
              JOIN "drive_item_generation" AS "file"
                ON "file"."libraryId" = "run"."libraryId"
               AND "file"."generation" = "run"."generation"
               AND "file"."itemId" = "scope"."itemId"
              LEFT JOIN "photo_generation" AS "hydrated"
                ON "hydrated"."libraryId" = "file"."libraryId"
               AND "hydrated"."generation" = "file"."generation"
               AND "hydrated"."photoId" = "file"."itemId"
              WHERE "file"."nodeType" = 'file'
                AND "hydrated"."photoId" IS NULL
            )
        `).pipe(Effect.mapError((error) => unavailable("activate", Option.some(error))));

        return yield* retryBackgroundSql(activationStatus(owner.runId)).pipe(
          Effect.mapError((error) =>
            unavailable("read", isSqlError(error) ? Option.some(error) : Option.none()),
          ),
        );
      },
    );

    const firstReviewablePhoto = Effect.fn("PhotoStore.firstReviewablePhoto")(function* (
      libraryId: LibraryId,
    ) {
      return yield* retryInteractiveSql(findFirstReviewable(libraryId)).pipe(
        Effect.mapError((error) =>
          unavailable("read", isSqlError(error) ? Option.some(error) : Option.none()),
        ),
      );
    });

    const getReviewablePhoto = Effect.fn("PhotoStore.getReviewablePhoto")(function* (
      resource: PhotoResource,
    ) {
      return yield* retryInteractiveSql(findReviewable(resource)).pipe(
        Effect.mapError((error) =>
          unavailable("read", isSqlError(error) ? Option.some(error) : Option.none()),
        ),
      );
    });

    return PhotoStore.of({
      activateHydratedGeneration,
      firstReviewablePhoto,
      getReviewablePhoto,
      nextStagedFile,
      stageHydratedFile,
    });
  }),
);
