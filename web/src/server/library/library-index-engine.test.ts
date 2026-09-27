import { Effect, Layer, Option, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { BetterAuthAccountId, BetterAuthUserId } from "../curator/model.ts";
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
  indexRunId as runId,
  indexStoreLayer,
  makeIndexDatabase as makeDatabase,
} from "./library-index-test-support.ts";
import { LibraryIndexStore } from "./library-index-store.ts";

const workflowA = IndexWorkflowInstanceId.make("workflow-a");

const workflowB = IndexWorkflowInstanceId.make("workflow-b");

const input: LibraryIndexWorkflowInput = {
  runId,
  libraryId: library.id,
  driveId: library.driveId,
  account: {
    userId: BetterAuthUserId.make("user-a"),
    betterAuthAccountId: BetterAuthAccountId.make("account-a"),
  },
};

describe("durable Bibliotheek index engine", () => {
  it("checkpoints opaque pages across service reconstruction and rejects a competing Workflow", async () => {
    const database = makeDatabase();
    const cursors: Array<Option.Option<GraphDeltaLink>> = [];
    const storeLayer = indexStoreLayer(database);

    const dependencies = Layer.mergeAll(
      storeLayer,
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
        Effect.flatMap((store) => store.ensureInitialRun(library, runId)),
        Effect.provide(storeLayer),
      ),
    );

    const first = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(input, workflowA)),
        Effect.provide(engineLayer),
      ),
    );

    const competing = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(input, workflowB)),
        Effect.provide(engineLayer),
      ),
    );

    const resumed = await Effect.runPromise(
      LibraryIndexEngine.pipe(
        Effect.flatMap((engine) => engine.processNextPage(input, workflowA)),
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
});
