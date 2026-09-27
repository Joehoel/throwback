import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Effect, Layer } from "effect";
import { CuratorStore, CuratorStoreLive } from "../curator/curator-store.ts";
import type { LibraryIndexWorkflowInput } from "./library-index-dispatcher.ts";
import { libraryIndexEngineLayer } from "./library-index-engine-layer.ts";
import type { LibraryIndexRuntimeOptions } from "./library-index-engine-layer.ts";
import { LibraryIndexEngine } from "./library-index-engine.ts";
import type { LibraryIndexStepResult } from "./library-index-engine.ts";
import { LibraryIndexStore, LibraryIndexStoreLive } from "./library-index-store.ts";
import { PhotoStore, PhotoStoreLive } from "../photo/photo-store.ts";

function persistenceLayer(database: D1Database) {
  return Layer.mergeAll(CuratorStoreLive, LibraryIndexStoreLive, PhotoStoreLive).pipe(
    Layer.provide(d1Layer({ db: database })),
  );
}

/** Execute one durable delta or Foto-hydration step with fresh infrastructure. */
export function processLibraryIndexStep(
  options: LibraryIndexRuntimeOptions,
  input: LibraryIndexWorkflowInput,
): Effect.Effect<LibraryIndexStepResult> {
  const persistence = persistenceLayer(options.database);

  return Effect.gen(function* () {
    const curatorStore = yield* CuratorStore;
    const indexStore = yield* LibraryIndexStore;
    const photoStore = yield* PhotoStore;

    const engineLayer = libraryIndexEngineLayer(options, {
      curator: curatorStore,
      index: indexStore,
      photo: photoStore,
    });

    return yield* LibraryIndexEngine.pipe(
      Effect.flatMap((engine) => engine.processNextStep(input)),
      Effect.provide(engineLayer),
      Effect.orDie,
    );
  }).pipe(Effect.provide(persistence), Effect.orDie);
}
