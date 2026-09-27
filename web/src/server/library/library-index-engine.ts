import { Context, Effect, Layer, Option, Schema } from "effect";
import { CuratorStore } from "../curator/curator-store.ts";
import { GraphAccessToken } from "../graph/graph-token.ts";
import { MicrosoftGraphApi } from "../graph/microsoft-graph-api.ts";
import type {
  GraphReauthenticationRequired,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
} from "./errors.ts";
import { LibraryIndexUnavailable } from "./errors.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { LibraryIndexStore } from "./library-index-store.ts";

export const LibraryIndexStepResult = Schema.Literals([
  "continue",
  "complete",
  "not_owner",
  "stopped",
  "waiting_for_reauthentication",
]);

export type LibraryIndexStepResult = typeof LibraryIndexStepResult.Type;

/** One resumable Graph-page step of the durable initial Bibliotheek enumeration. */
export interface LibraryIndexEngineService {
  readonly processNextPage: (
    input: LibraryIndexWorkflowInput,
  ) => Effect.Effect<
    LibraryIndexStepResult,
    | LibraryIndexUnavailable
    | GraphReauthenticationRequired
    | OneDriveFolderNotFound
    | OneDriveUnavailable
  >;
}

/** One resumable Graph-page step of the durable initial Bibliotheek enumeration. */
export class LibraryIndexEngine extends Context.Service<
  LibraryIndexEngine,
  LibraryIndexEngineService
>()("throwback/library/LibraryIndexEngine") {}

/** Compose server-only Graph credentials, drive-root delta, and D1 page checkpoints. */
export const LibraryIndexEngineLive = Layer.effect(
  LibraryIndexEngine,
  Effect.gen(function* () {
    const tokens = yield* GraphAccessToken;
    const graph = yield* MicrosoftGraphApi;
    const store = yield* LibraryIndexStore;
    const curators = yield* CuratorStore;

    const processNextPage = Effect.fn("LibraryIndexEngine.processNextPage")(function* (
      input: LibraryIndexWorkflowInput,
    ) {
      const { workflowInstanceId } = input;
      const beforeClaim = yield* store.getRun(input.libraryId);

      if (Option.exists(beforeClaim, (run) => run.status === "active")) {
        return "complete" as const;
      }

      const claimed = yield* store.claimRun(input.runId, workflowInstanceId);

      if (!claimed) {
        return "not_owner" as const;
      }

      const run = yield* store.getRun(input.libraryId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new LibraryIndexUnavailable({
                  message: "De duurzame Bibliotheek-indexopdracht ontbreekt.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      );

      const page = yield* tokens.get(input.account).pipe(
        Effect.flatMap((token) => graph.getDriveRootDeltaPage(token, input.driveId, run.nextLink)),
        Effect.asSome,
        Effect.catchTag("GraphReauthenticationRequired", () =>
          curators.findMicrosoftAccount(input.account.userId).pipe(
            Effect.mapError(
              () =>
                new LibraryIndexUnavailable({
                  message: "De actuele OneDrive-koppeling kon niet worden vastgesteld.",
                }),
            ),
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new LibraryIndexUnavailable({
                      message: "De Microsoft-accountkoppeling voor de index ontbreekt.",
                    }),
                  ),
                onSome: (account) =>
                  store.markWaitingForReauthentication(
                    input.runId,
                    workflowInstanceId,
                    account.graphConnectionVersion,
                  ),
              }),
            ),
            Effect.as(Option.none()),
          ),
        ),
        Effect.catchTag("OneDriveFolderNotFound", () =>
          store.markFailed(input.runId, workflowInstanceId).pipe(Effect.as(Option.none())),
        ),
        Effect.catchTag("OneDriveUnavailable", (error) =>
          store
            .markRetrying(input.runId, workflowInstanceId)
            .pipe(Effect.andThen(Effect.fail(error))),
        ),
      );

      if (Option.isNone(page)) {
        const stopped = yield* store.getRun(input.libraryId);

        return Option.exists(
          stopped,
          (current) => current.status === "waiting_for_reauthentication",
        )
          ? ("waiting_for_reauthentication" as const)
          : ("stopped" as const);
      }

      const checkpoint = yield* store.stagePage({
        runId: input.runId,
        workflowInstanceId,
        expectedNextLink: run.nextLink,
        page: page.value,
      });

      return checkpoint.status === "active" ? ("complete" as const) : ("continue" as const);
    });

    return LibraryIndexEngine.of({ processNextPage });
  }),
);
