import { Context, Effect, Layer, Option, Schema } from "effect";
import { CuratorStore } from "../curator/curator-store.ts";
import { GraphAccessToken } from "../graph/graph-token.ts";
import { MicrosoftGraphApi } from "../graph/microsoft-graph-api.ts";
import type { PhotoProjectionUnavailable } from "../photo/errors.ts";
import { PhotoHydrator } from "../photo/photo-hydrator.ts";
import { PhotoStore } from "../photo/photo-store.ts";
import type {
  GraphReauthenticationRequired,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
} from "./errors.ts";
import { LibraryIndexUnavailable } from "./errors.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { LibraryIndexStore } from "./library-index-store.ts";

/** Durable outcome of one bounded delta or Foto-hydration step. */
export const LibraryIndexStepResult = Schema.Literals([
  "continue",
  "complete",
  "not_owner",
  "stopped",
  "waiting_for_reauthentication",
]);

/** Durable outcome of one bounded delta or Foto-hydration step. */
export type LibraryIndexStepResult = typeof LibraryIndexStepResult.Type;

/** One resumable step of durable enumeration, hydration, or activation. */
export interface LibraryIndexEngineService {
  readonly processNextStep: (
    input: LibraryIndexWorkflowInput,
  ) => Effect.Effect<
    LibraryIndexStepResult,
    | LibraryIndexUnavailable
    | PhotoProjectionUnavailable
    | GraphReauthenticationRequired
    | OneDriveFolderNotFound
    | OneDriveUnavailable
  >;
}

/** One resumable step of durable enumeration, hydration, or activation. */
export class LibraryIndexEngine extends Context.Service<
  LibraryIndexEngine,
  LibraryIndexEngineService
>()("throwback/library/LibraryIndexEngine") {}

/** Compose Graph delta, bounded JPEG hydration, and atomic D1 publication. */
export const LibraryIndexEngineLive = Layer.effect(
  LibraryIndexEngine,
  Effect.gen(function* () {
    const tokens = yield* GraphAccessToken;
    const graph = yield* MicrosoftGraphApi;
    const store = yield* LibraryIndexStore;
    const photos = yield* PhotoStore;
    const hydrator = yield* PhotoHydrator;
    const curators = yield* CuratorStore;

    const markReauthentication = Effect.fnUntraced(function* (input: LibraryIndexWorkflowInput) {
      const account = yield* curators.findMicrosoftAccount(input.account.userId).pipe(
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
            onSome: Effect.succeed,
          }),
        ),
      );

      yield* store.markWaitingForReauthentication(
        input.runId,
        input.workflowInstanceId,
        account.graphConnectionVersion,
      );
    });

    const stoppedResult = Effect.fnUntraced(function* (input: LibraryIndexWorkflowInput) {
      const stopped = yield* store.getRun(input.libraryId);

      return Option.exists(stopped, (current) => current.status === "waiting_for_reauthentication")
        ? ("waiting_for_reauthentication" as const)
        : ("stopped" as const);
    });

    const processNextStep = Effect.fn("LibraryIndexEngine.processNextStep")(function* (
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

      const token = yield* tokens.get(input.account).pipe(
        Effect.asSome,
        Effect.catchTag("GraphReauthenticationRequired", () =>
          markReauthentication(input).pipe(Effect.as(Option.none())),
        ),
      );

      if (Option.isNone(token)) {
        return yield* stoppedResult(input);
      }

      if (Option.isSome(run.pendingDeltaLink)) {
        const candidate = yield* photos.nextStagedFile({
          runId: input.runId,
          workflowInstanceId,
        });

        if (Option.isNone(candidate)) {
          const activated = yield* photos.activateHydratedGeneration({
            runId: input.runId,
            workflowInstanceId,
          });

          if (!activated) {
            yield* store.markFailed(input.runId, workflowInstanceId);

            return "stopped" as const;
          }

          return "complete" as const;
        }

        const hydrated = yield* hydrator.hydrate(token.value, input.driveId, candidate.value).pipe(
          Effect.asSome,
          Effect.catchTag("GraphReauthenticationRequired", () =>
            markReauthentication(input).pipe(Effect.as(Option.none())),
          ),
          Effect.catchTag("OneDriveUnavailable", (error) =>
            store
              .markRetrying(input.runId, workflowInstanceId)
              .pipe(Effect.andThen(Effect.fail(error))),
          ),
        );

        if (Option.isNone(hydrated)) {
          return yield* stoppedResult(input);
        }

        yield* photos.stageHydratedFile({ runId: input.runId, workflowInstanceId }, hydrated.value);

        return "continue" as const;
      }

      const page = yield* graph
        .getDriveRootDeltaPage(token.value, input.driveId, run.nextLink)
        .pipe(
          Effect.asSome,
          Effect.catchTag("GraphReauthenticationRequired", () =>
            markReauthentication(input).pipe(Effect.as(Option.none())),
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
        return yield* stoppedResult(input);
      }

      yield* store.stagePage({
        runId: input.runId,
        workflowInstanceId,
        expectedNextLink: run.nextLink,
        page: page.value,
      });

      return "continue" as const;
    });

    return LibraryIndexEngine.of({ processNextStep });
  }),
);
