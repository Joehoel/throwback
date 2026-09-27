import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Effect, Layer } from "effect";
import { CuratorStore, CuratorStoreLive } from "../curator/curator-store.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { libraryIndexEngineLayer } from "./library-index-engine-layer.ts";
import type { LibraryIndexRuntimeOptions } from "./library-index-engine-layer.ts";
import { LibraryIndexEngine } from "./library-index-engine.ts";
import type { LibraryIndexStepResult } from "./library-index-engine.ts";
import type { IndexRunId, IndexWorkflowInstanceId } from "./library-index-model.ts";
import { LibraryIndexStore, LibraryIndexStoreLive } from "./library-index-store.ts";

function persistenceLayer(database: D1Database) {
  return Layer.mergeAll(CuratorStoreLive, LibraryIndexStoreLive).pipe(
    Layer.provide(d1Layer({ db: database })),
  );
}

/** Execute one durable page step with fresh request-scoped Effect infrastructure. */
export function processLibraryIndexPage(
  options: LibraryIndexRuntimeOptions,
  input: LibraryIndexWorkflowInput,
  workflowInstanceId: IndexWorkflowInstanceId,
): Effect.Effect<LibraryIndexStepResult> {
  const persistence = persistenceLayer(options.database);

  return Effect.gen(function* () {
    const curatorStore = yield* CuratorStore;
    const indexStore = yield* LibraryIndexStore;
    const engineLayer = libraryIndexEngineLayer(options, curatorStore, indexStore);

    return yield* LibraryIndexEngine.pipe(
      Effect.flatMap((engine) => engine.processNextPage(input, workflowInstanceId)),
      Effect.provide(engineLayer),
      Effect.orDie,
    );
  }).pipe(Effect.provide(persistence), Effect.orDie);
}

/** Persist the chosen Workflow instance before an internal dispatch is acknowledged. */
export function recordLibraryIndexDispatch(
  database: D1Database,
  runId: IndexRunId,
  workflowInstanceId: IndexWorkflowInstanceId,
): Effect.Effect<void> {
  return LibraryIndexStore.pipe(
    Effect.flatMap((store) => store.recordDispatched(runId, workflowInstanceId)),
    Effect.provide(LibraryIndexStoreLive.pipe(Layer.provide(d1Layer({ db: database })))),
    Effect.orDie,
  );
}
