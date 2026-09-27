import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  CompleteDeltaContinuation,
  GraphDeltaLink,
  IndexRunId,
  NextDeltaContinuation,
  IndexWorkflowInstanceId,
} from "./library-index-model.ts";
import {
  indexLibrary as library,
  indexNode as node,
  indexRunId as runId,
  indexStoreLayer as storeLayer,
  indexWorkflowId as workflowId,
  makeIndexDatabase as makeMigratedDatabase,
} from "./library-index-test-support.ts";
import { LibraryIndexStore } from "./library-index-store.ts";
import { DriveItemId } from "./model.ts";

const competingRunId = IndexRunId.make("00000000-0000-4000-8000-000000000102");

describe("Effect SQL D1 Bibliotheek index store", () => {
  it("resumes one generation and activates it only with the final opaque delta link", async () => {
    const database = makeMigratedDatabase();

    const firstCheckpoint = await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            const firstRun = yield* store.ensureInitialRun(library, runId);
            const repeatedRun = yield* store.ensureInitialRun(library, competingRunId);
            const claimed = yield* store.claimRun(runId, workflowId);

            const competingClaim = yield* store.claimRun(
              runId,
              IndexWorkflowInstanceId.make("workflow-b"),
            );

            yield* store.stagePage({
              runId,
              workflowInstanceId: workflowId,
              expectedNextLink: Option.none(),
              page: {
                items: [
                  node({ id: "drive-root", nodeType: "folder" }),
                  node({ id: "selected-root", parentId: "drive-root", nodeType: "folder" }),
                  node({ id: "outside", parentId: "drive-root", nodeType: "folder" }),
                  node({ id: "moving-photo", parentId: "outside", nodeType: "file" }),
                ],
                continuation: NextDeltaContinuation.make({
                  link: GraphDeltaLink.make("https://graph.example.test/opaque?token=a%2Fb"),
                }),
              },
            });

            return { claimed, competingClaim, firstRun, repeatedRun };
          }),
        ),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(firstCheckpoint.repeatedRun.runId).toBe(firstCheckpoint.firstRun.runId);
    expect(firstCheckpoint.claimed).toBe(true);
    expect(firstCheckpoint.competingClaim).toBe(false);
    expect(firstCheckpoint.firstRun.activeGeneration).toEqual(Option.none());

    const resumed = await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            const checkpoint = yield* store.getRun(library.id);

            yield* store.stagePage({
              runId,
              workflowInstanceId: workflowId,
              expectedNextLink: Option.none(),
              page: {
                items: [node({ id: "moving-photo", parentId: "outside", nodeType: "file" })],
                continuation: NextDeltaContinuation.make({
                  link: GraphDeltaLink.make("https://graph.example.test/stale"),
                }),
              },
            });

            yield* store.stagePage({
              runId,
              workflowInstanceId: workflowId,
              expectedNextLink: Option.some(
                GraphDeltaLink.make("https://graph.example.test/opaque?token=a%2Fb"),
              ),
              page: {
                items: [
                  node({ id: "moving-photo", parentId: "selected-root", nodeType: "file" }),
                  node({ id: "removed-photo", parentId: "selected-root", nodeType: "file" }),
                  node({ id: "removed-photo", nodeType: "file", tombstone: true }),
                ],
                continuation: CompleteDeltaContinuation.make({
                  link: GraphDeltaLink.make("https://graph.example.test/opaque?$deltatoken=final"),
                }),
              },
            });

            return {
              checkpoint,
              active: yield* store.getRun(library.id),
              movingPhotoInScope: yield* store.containsActiveItem(
                library.id,
                DriveItemId.make("moving-photo"),
              ),
              outsideInScope: yield* store.containsActiveItem(
                library.id,
                DriveItemId.make("outside"),
              ),
              removedPhotoInScope: yield* store.containsActiveItem(
                library.id,
                DriveItemId.make("removed-photo"),
              ),
            };
          }),
        ),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(Option.getOrThrow(resumed.checkpoint).nextLink).toEqual(
      Option.some("https://graph.example.test/opaque?token=a%2Fb"),
    );
    expect(Option.getOrThrow(resumed.checkpoint).activeGeneration).toEqual(Option.none());
    expect(Option.getOrThrow(resumed.active)).toMatchObject({
      status: "active",
      pagesProcessed: 2,
      processedItems: 7,
    });
    expect(Option.getOrThrow(resumed.active).deltaLink).toEqual(
      Option.some("https://graph.example.test/opaque?$deltatoken=final"),
    );
    expect(resumed.movingPhotoInScope).toBe(true);
    expect(resumed.outsideInScope).toBe(false);
    expect(resumed.removedPhotoInScope).toBe(false);

    expect(
      database
        .prepare(
          `SELECT "parentItemId", "nodeType", "tombstone"
           FROM "drive_item_generation"
           WHERE "libraryId" = ? AND "itemId" = ?`,
        )
        .get(library.id, "moving-photo"),
    ).toEqual({ parentItemId: "selected-root", nodeType: "file", tombstone: 0 });
  });

  it("keeps the whole-drive skeleton deliberately minimal", () => {
    const database = makeMigratedDatabase();

    const columns = database
      .prepare('PRAGMA table_info("drive_item_generation")')
      .all()
      .map((column) => column.name);

    expect(columns).toEqual([
      "libraryId",
      "generation",
      "itemId",
      "parentItemId",
      "nodeType",
      "tombstone",
    ]);
  });

  it("rolls back staged items when the page checkpoint cannot be committed", async () => {
    const database = makeMigratedDatabase();

    await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            yield* store.ensureInitialRun(library, runId);
            yield* store.claimRun(runId, workflowId);
          }),
        ),
        Effect.provide(storeLayer(database)),
      ),
    );

    database.exec(`
      CREATE TRIGGER "reject_final_index_checkpoint"
      BEFORE UPDATE OF "status" ON "library_index_run"
      WHEN NEW."status" = 'active'
      BEGIN
        SELECT RAISE(ABORT, 'synthetic checkpoint failure');
      END;
    `);

    const result = await Effect.runPromiseExit(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          store.stagePage({
            runId,
            workflowInstanceId: workflowId,
            expectedNextLink: Option.none(),
            page: {
              items: [node({ id: "must-roll-back", parentId: "selected-root", nodeType: "file" })],
              continuation: CompleteDeltaContinuation.make({
                link: GraphDeltaLink.make("https://graph.example.test/final"),
              }),
            },
          }),
        ),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(
      database
        .prepare('SELECT COUNT(*) AS "count" FROM "drive_item_generation" WHERE "itemId" = ?')
        .get("must-roll-back"),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare('SELECT "status", "activeGeneration" FROM "library_index_run" WHERE "runId" = ?')
        .get(runId),
    ).toEqual({ status: "running", activeGeneration: null });
  });
});
