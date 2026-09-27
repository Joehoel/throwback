import { Effect, Layer, Option } from "effect";
import { CuratorStore } from "../curator/curator-store.ts";
import type { LibraryIndexWorkflowInput } from "../library/library-index-dispatcher.ts";
import { LibraryIndexEngine, LibraryIndexEngineLive } from "../library/library-index-engine.ts";
import { indexProgress } from "../library/library-index-model.ts";
import { LibraryIndexStore } from "../library/library-index-store.ts";
import { PhotoHydratorLive } from "./photo-hydrator.ts";
import { PhotoStore } from "./photo-store.ts";
import { photoTracerGraphLayers } from "./photo-tracer-graph-test-support.ts";

/** Run enumeration, real JPEG hydration, and activation through the production engine. */
export const runPhotoTracerEngine = Effect.fn("PhotoTracer.runEngine")(function* (
  input: LibraryIndexWorkflowInput,
  jpeg: Uint8Array,
) {
  const indexes = yield* LibraryIndexStore;
  const photos = yield* PhotoStore;
  const graph = photoTracerGraphLayers(jpeg);

  const engineLayer = LibraryIndexEngineLive.pipe(
    Layer.provide([
      Layer.succeed(LibraryIndexStore, indexes),
      Layer.succeed(PhotoStore, photos),
      Layer.succeed(CuratorStore, {
        claim: () => Effect.die("unused"),
        findMicrosoftAccount: () => Effect.die("unused"),
        getOwner: Effect.die("unused"),
      }),
      graph.token,
      graph.delta,
      PhotoHydratorLive.pipe(Layer.provide(graph.photo)),
    ]),
  );

  return yield* LibraryIndexEngine.pipe(
    Effect.flatMap((engine) =>
      Effect.gen(function* () {
        const enumerated = yield* engine.processNextStep(input);
        const stagedRun = yield* indexes.getRun(input.libraryId);
        const hiddenPhoto = yield* photos.firstReviewablePhoto(input.libraryId);
        const skippedNonJpeg = yield* engine.processNextStep(input);
        const hydratedJpeg = yield* engine.processNextStep(input);
        const activated = yield* engine.processNextStep(input);
        const activeRun = yield* indexes.getRun(input.libraryId);

        return {
          activated,
          activePhoto: yield* photos.firstReviewablePhoto(input.libraryId),
          activeProgress: Option.map(activeRun, indexProgress),
          enumerated,
          hiddenPhoto,
          hydratedJpeg,
          skippedNonJpeg,
          stagedProgress: Option.map(stagedRun, indexProgress),
        };
      }),
    ),
    Effect.provide(engineLayer),
  );
});
