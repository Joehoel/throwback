import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  GraphConnectionVersion,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { LibraryIndexDispatcher } from "./library-index-dispatcher.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { LibraryIndex, LibraryIndexLive } from "./library-index.ts";
import { GraphDeltaLink, NextDeltaContinuation } from "./library-index-model.ts";
import {
  indexLibrary as library,
  indexStoreLayer,
  makeIndexDatabase,
} from "./library-index-test-support.ts";
import { LibraryIndexStore } from "./library-index-store.ts";

function account(graphConnectionVersion: GraphConnectionVersion) {
  return {
    userId: BetterAuthUserId.make("user-a"),
    betterAuthAccountId: BetterAuthAccountId.make("account-a"),
    graphConnectionVersion,
    identity: CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("owner-oid"),
    }),
    display: {
      provider: "microsoft" as const,
      name: "Curator",
      email: "curator@example.test",
    },
    hasGraphConnection: true,
  };
}

describe("Bibliotheek index application policy", () => {
  it("concurrent reconnect bootstraps dispatch the same pre-recorded fresh Workflow attempt", async () => {
    const database = makeIndexDatabase();
    const storeLayer = indexStoreLayer(database);
    const dispatches: Array<LibraryIndexWorkflowInput> = [];

    const dispatcherLayer = Layer.succeed(LibraryIndexDispatcher, {
      dispatch: (input) =>
        Effect.sync(() => {
          dispatches.push(input);
        }),
    });

    const dependencies = Layer.mergeAll(storeLayer, dispatcherLayer);
    const applicationLayer = LibraryIndexLive.pipe(Layer.provide(dependencies));
    const layer = Layer.mergeAll(dependencies, applicationLayer);
    const initialVersion = GraphConnectionVersion.make("connection-v1");
    const reconnectedVersion = GraphConnectionVersion.make("connection-v2");

    await Effect.runPromise(
      Effect.gen(function* () {
        const index = yield* LibraryIndex;
        const store = yield* LibraryIndexStore;

        yield* index.startOrResume(account(initialVersion), library);

        const initialDispatch = Option.getOrThrow(Option.fromNullishOr(dispatches[0]));

        yield* store.claimRun(initialDispatch.runId, initialDispatch.workflowInstanceId);
        yield* store.stagePage({
          runId: initialDispatch.runId,
          workflowInstanceId: initialDispatch.workflowInstanceId,
          expectedNextLink: Option.none(),
          page: {
            items: [],
            continuation: NextDeltaContinuation.make({
              link: GraphDeltaLink.make("https://graph.example.test/persisted-next"),
            }),
          },
        });
        yield* store.markWaitingForReauthentication(
          initialDispatch.runId,
          initialDispatch.workflowInstanceId,
          initialVersion,
        );

        yield* Effect.all(
          [
            index.startOrResume(account(reconnectedVersion), library),
            index.startOrResume(account(reconnectedVersion), library),
          ],
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.provide(layer)),
    );

    const initialDispatch = dispatches[0];
    const firstResume = dispatches[1];
    const competingResume = dispatches[2];

    expect(initialDispatch).toBeDefined();
    expect(firstResume).toBeDefined();
    expect(competingResume).toBeDefined();
    expect(firstResume?.workflowInstanceId).not.toBe(initialDispatch?.workflowInstanceId);
    expect(competingResume?.workflowInstanceId).toBe(firstResume?.workflowInstanceId);
    expect(
      database
        .prepare(
          'SELECT "status", "workflowInstanceId", "nextLink" FROM "library_index_run" WHERE "libraryId" = ?',
        )
        .get(library.id),
    ).toEqual({
      status: "queued",
      workflowInstanceId: firstResume?.workflowInstanceId,
      nextLink: "https://graph.example.test/persisted-next",
    });
  });
});
