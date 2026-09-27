import { Context, Schema } from "effect";
import type { Effect } from "effect";
import { BetterAuthAccountId, BetterAuthUserId } from "../curator/model.ts";
import type { LibraryIndexUnavailable } from "./errors.ts";
import { IndexRunId } from "./library-index-model.ts";
import { DriveId, LibraryId } from "./model.ts";

/** Token-free server command used to start or resume one durable index Workflow. */
export const LibraryIndexWorkflowInput = Schema.Struct({
  runId: IndexRunId,
  libraryId: LibraryId,
  driveId: DriveId,
  account: Schema.Struct({
    userId: BetterAuthUserId,
    betterAuthAccountId: BetterAuthAccountId,
  }),
});

/** Token-free server command used to start or resume one durable index Workflow. */
export type LibraryIndexWorkflowInput = typeof LibraryIndexWorkflowInput.Type;

/** Internal durable-work boundary; browser callers never receive this capability. */
export interface LibraryIndexDispatcherService {
  readonly dispatch: (
    input: LibraryIndexWorkflowInput,
  ) => Effect.Effect<void, LibraryIndexUnavailable>;
}

/** Internal durable-work boundary; browser callers never receive this capability. */
export class LibraryIndexDispatcher extends Context.Service<
  LibraryIndexDispatcher,
  LibraryIndexDispatcherService
>()("throwback/library/LibraryIndexDispatcher") {}
