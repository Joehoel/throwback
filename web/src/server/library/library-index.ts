import { Context, Effect, Layer, Option } from "effect";
import type { SignedInMicrosoftAccount } from "../curator/model.ts";
import { LibraryIndexUnavailable } from "./errors.ts";
import { LibraryIndexDispatcher } from "./library-index-dispatcher.ts";
import type { LibraryIndexProgress } from "./library-index-model.ts";
import { IndexRunId, indexProgress } from "./library-index-model.ts";
import { LibraryIndexStore } from "./library-index-store.ts";
import type { LibraryBoundary } from "./model.ts";

/** Application policy that creates and dispatches the singleton initial Bibliotheek index. */
export interface LibraryIndexService {
  readonly startOrResume: (
    account: SignedInMicrosoftAccount,
    library: LibraryBoundary,
  ) => Effect.Effect<LibraryIndexProgress, LibraryIndexUnavailable>;
  readonly getProgress: (
    library: LibraryBoundary,
  ) => Effect.Effect<Option.Option<LibraryIndexProgress>, LibraryIndexUnavailable>;
}

/** Application policy that creates and dispatches the singleton initial Bibliotheek index. */
export class LibraryIndex extends Context.Service<LibraryIndex, LibraryIndexService>()(
  "throwback/library/LibraryIndex",
) {}

/** Compose durable D1 run state with the internal Workflow dispatcher. */
export const LibraryIndexLive = Layer.effect(
  LibraryIndex,
  Effect.gen(function* () {
    const store = yield* LibraryIndexStore;
    const dispatcher = yield* LibraryIndexDispatcher;

    const getProgress = Effect.fn("LibraryIndex.getProgress")(function* (library: LibraryBoundary) {
      return yield* store.getRun(library.id).pipe(Effect.map(Option.map(indexProgress)));
    });

    const startOrResume = Effect.fn("LibraryIndex.startOrResume")(function* (
      account: SignedInMicrosoftAccount,
      library: LibraryBoundary,
    ) {
      const run = yield* store.ensureInitialRun(library, IndexRunId.make(crypto.randomUUID()));

      if (run.status !== "active" && Option.isNone(run.workflowInstanceId)) {
        yield* dispatcher.dispatch({
          runId: run.runId,
          libraryId: library.id,
          driveId: library.driveId,
          account: {
            userId: account.userId,
            betterAuthAccountId: account.betterAuthAccountId,
          },
        });
      }

      const current = yield* store.getRun(library.id);

      return yield* Option.match(current, {
        onNone: () =>
          Effect.fail(
            new LibraryIndexUnavailable({
              message: "De Bibliotheek-index kon niet duurzaam worden gestart.",
            }),
          ),
        onSome: (value) => Effect.succeed(indexProgress(value)),
      });
    });

    return LibraryIndex.of({ getProgress, startOrResume });
  }),
);
