import { Effect, Layer, Option } from "effect";
import { LibraryIndex } from "../../library/library-index.ts";
import type { LibraryIndexProgress } from "../../library/library-index-model.ts";
import type { Photo } from "../../photo/model.ts";
import { PhotoStore } from "../../photo/photo-store.ts";

/** Projection fixtures consumed by Curator bootstrap policy in API tests. */
export function domainProjectionLayers(options: {
  readonly firstPhoto?: Photo;
  readonly indexProgress?: LibraryIndexProgress;
}) {
  return Layer.mergeAll(
    Layer.succeed(LibraryIndex, {
      getProgress: () => Effect.succeed(Option.none()),
      startOrResume: () =>
        Effect.succeed(
          options.indexProgress ?? {
            status: "running" as const,
            pagesProcessed: 2,
            processedItems: 42,
            reviewBlocked: true,
          },
        ),
    }),
    Layer.succeed(PhotoStore, {
      activateHydratedGeneration: () => Effect.die("unused"),
      firstReviewablePhoto: () => Effect.succeed(Option.fromNullishOr(options.firstPhoto)),
      getReviewablePhoto: () => Effect.die("unused"),
      nextStagedFile: () => Effect.die("unused"),
      stageHydratedFile: () => Effect.die("unused"),
    }),
  );
}
