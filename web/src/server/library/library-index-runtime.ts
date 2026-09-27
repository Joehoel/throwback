import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Effect, Layer } from "effect";
import { CuratorStore, CuratorStoreLive } from "../curator/curator-store.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { libraryIndexEngineLayer } from "./library-index-engine-layer.ts";
import type { LibraryIndexRuntimeOptions } from "./library-index-engine-layer.ts";
import { LibraryIndexEngine } from "./library-index-engine.ts";
import type { LibraryIndexStepResult } from "./library-index-engine.ts";
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
): Effect.Effect<LibraryIndexStepResult> {
  const persistence = persistenceLayer(options.database);

  return Effect.gen(function* () {
    const curatorStore = yield* CuratorStore;
    const indexStore = yield* LibraryIndexStore;
    const engineLayer = libraryIndexEngineLayer(options, curatorStore, indexStore);

    return yield* LibraryIndexEngine.pipe(
      Effect.flatMap((engine) => engine.processNextPage(input)),
      Effect.provide(engineLayer),
      Effect.orDie,
    );
  }).pipe(Effect.provide(persistence), Effect.orDie);
}
