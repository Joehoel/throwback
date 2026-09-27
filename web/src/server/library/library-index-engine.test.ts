import { Effect, Layer, Option, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { BetterAuthAccountId, BetterAuthUserId, GraphConnectionVersion } from "../curator/model.ts";
import { GraphAccessToken } from "../graph/graph-token.ts";
import { MicrosoftGraphApi } from "../graph/microsoft-graph-api.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { LibraryIndexEngine, LibraryIndexEngineLive } from "./library-index-engine.ts";
import {
  CompleteDeltaContinuation,
  GraphDeltaLink,
  IndexWorkflowInstanceId,
  NextDeltaContinuation,
} from "./library-index-model.ts";
import {
  indexLibrary as library,
  indexCuratorStoreLayer as curatorStoreLayer,
  indexGraphConnectionVersion as graphConnectionVersion,
  indexReauthenticationRequired as reauthenticationRequired,
  indexRunId as runId,
  indexStoreLayer,
  makeIndexDatabase as makeDatabase,
} from "./library-index-engine-test-support.ts";
import { LibraryIndexStore } from "./library-index-store.ts";

const workflowA = IndexWorkflowInstanceId.make("workflow-a");

const workflowB = IndexWorkflowInstanceId.make("workflow-b");

const workflowC = IndexWorkflowInstanceId.make("workflow-c");

const input: LibraryIndexWorkflowInput = {
  runId,
  workflowInstanceId: workflowA,
  libraryId: library.id,
  driveId: library.driveId,
  account: {
    userId: BetterAuthUserId.make("user-a"),
    betterAuthAccountId: BetterAuthAccountId.make("account-a"),
  },
};

function inputFor(workflowInstanceId: IndexWorkflowInstanceId): LibraryIndexWorkflowInput {
  return { ...input, workflowInstanceId };
}

describe("durable Bibliotheek index engine", () => {
  it("checkpoints opaque pages across service reconstruction and rejects a competing Workflow", async () => {
    const database = makeDatabase();
    const cursors: Array<Option.Option<GraphDeltaLink>> = [];
    const storeLayer = indexStoreLayer(database);

    const dependencies = Layer.mergeAll(
      storeLayer,
      curatorStoreLayer,
      Layer.succeed(GraphAccessToken, {
        get: () => Effect.succeed(Redacted.make("server-only-token")),
      }),
      Layer.succeed(MicrosoftGraphApi, {
        getDefaultDrive: () => Effect.die("unused"),
        getFolder: () => Effect.die("unused"),
        listChildFolders: () => Effect.die("unused"),
        getDriveRootDeltaPage: (_token, _driveId, cursor) => {
          cursors.push(cursor);

          return Effect.succeed(
            Option.isNone(cursor)
              ? {
                  items: [],
                  continuation: NextDeltaContinuation.make({
                    link: GraphDeltaLink.make("https://graph.example.test/opaque-next"),
                  }),
                }
              : {
                  items: [],
                  continuation: CompleteDeltaContinuation.make({
                    link: GraphDeltaLink.make("https://graph.example.test/opaque-final"),
                  }),
                },
          );
        },
      }),
    );

    const engineLayer = LibraryIndexEngineLive.pipe(Layer.provide(dependencies));

    await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            yield* store.ensureInitialRun(library, runId, graphConnectionVersion);
            yield* store.reserveDispatchAttempt(runId, workflowA, graphConnectionVersion);
          }),
        ),
        Effect.provide(storeLayer),
      ),
    );

    const first = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowA))),
        Effect.provide(engineLayer),
      ),
    );

    const competing = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowB))),
        Effect.provide(engineLayer),
      ),
    );

    const resumed = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowA))),
        Effect.provide(engineLayer),
      ),
    );

    expect(first).toBe("continue");
    expect(competing).toBe("not_owner");
    expect(resumed).toBe("complete");
    expect(cursors).toEqual([
      Option.none(),
      Option.some(GraphDeltaLink.make("https://graph.example.test/opaque-next")),
    ]);
  });

  it("resumes reauthentication from the persisted nextLink while one fresh attempt owns the run", async () => {
    const database = makeDatabase();
    const storeLayer = indexStoreLayer(database);
    const nextLink = GraphDeltaLink.make("https://graph.example.test/persisted-next");
    const cursors: Array<Option.Option<GraphDeltaLink>> = [];
    let tokenRequests = 0;

    const dependencies = Layer.mergeAll(
      storeLayer,
      curatorStoreLayer,
      Layer.succeed(GraphAccessToken, {
        get: () => {
          tokenRequests += 1;

          return tokenRequests === 2
            ? Effect.fail(reauthenticationRequired())
            : Effect.succeed(Redacted.make("server-only-token"));
        },
      }),
      Layer.succeed(MicrosoftGraphApi, {
        getDefaultDrive: () => Effect.die("unused"),
        getFolder: () => Effect.die("unused"),
        listChildFolders: () => Effect.die("unused"),
        getDriveRootDeltaPage: (_token, _driveId, cursor) => {
          cursors.push(cursor);

          return Effect.succeed(
            Option.isNone(cursor)
              ? {
                  items: [],
                  continuation: NextDeltaContinuation.make({ link: nextLink }),
                }
              : {
                  items: [],
                  continuation: CompleteDeltaContinuation.make({
                    link: GraphDeltaLink.make("https://graph.example.test/final-delta"),
                  }),
                },
          );
        },
      }),
    );

    const engineLayer = LibraryIndexEngineLive.pipe(Layer.provide(dependencies));

    await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            yield* store.ensureInitialRun(library, runId, graphConnectionVersion);
            yield* store.reserveDispatchAttempt(runId, workflowA, graphConnectionVersion);
          }),
        ),
        Effect.provide(storeLayer),
      ),
    );

    const initial = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowA))),
        Effect.provide(engineLayer),
      ),
    );

    const waiting = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowA))),
        Effect.provide(engineLayer),
      ),
    );

    const reservations = await Effect.runPromise(
      LibraryIndexStore.pipe(
        Effect.flatMap((store) =>
          Effect.gen(function* () {
            const freshVersion = GraphConnectionVersion.make("connection-v2");
            const resumed = yield* store.reserveDispatchAttempt(runId, workflowB, freshVersion);
            const competing = yield* store.reserveDispatchAttempt(runId, workflowC, freshVersion);

            return { competing, resumed };
          }),
        ),
        Effect.provide(storeLayer),
      ),
    );

    const competing = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowC))),
        Effect.provide(engineLayer),
      ),
    );

    const resumed = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(inputFor(workflowB))),
        Effect.provide(engineLayer),
      ),
    );

    expect(initial).toBe("continue");
    expect(waiting).toBe("waiting_for_reauthentication");
    expect(reservations.resumed.workflowInstanceId).toEqual(Option.some(workflowB));
    expect(reservations.competing.workflowInstanceId).toEqual(Option.some(workflowB));
    expect(competing).toBe("not_owner");
    expect(resumed).toBe("complete");
    expect(cursors).toEqual([Option.none(), Option.some(nextLink)]);
  });
});
