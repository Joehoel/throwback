import type { DatabaseSync } from "node:sqlite";
import { Effect, Layer, Option, Stream } from "effect";
import { LibraryStore } from "../library/library-store.ts";
import { PhotoLibrary, PhotoLibraryLive } from "./photo-library.ts";
import { PhotoStore } from "./photo-store.ts";
import { photoTracerPersistenceLayer } from "./photo-store-test-support.ts";
import { runPhotoTracerEngine } from "./photo-tracer-engine-test-support.ts";
import { photoTracerGraphLayers } from "./photo-tracer-graph-test-support.ts";
import { loadPhotoTracerJpeg } from "./photo-tracer-jpeg-test-support.ts";
import {
  photoTracerAccount,
  selectPhotoTracerLibraryWithIndex,
} from "./photo-tracer-selection-test-support.ts";

/** Execute the first complete production-service tracer over real D1 state. */
export async function executePhotoTracer(database: DatabaseSync) {
  const jpeg = await loadPhotoTracerJpeg();

  return Effect.runPromise(
    Effect.gen(function* () {
      const selection = yield* selectPhotoTracerLibraryWithIndex;
      const engine = yield* runPhotoTracerEngine(selection.workflowInput, jpeg);
      const libraries = yield* LibraryStore;
      const photos = yield* PhotoStore;
      const graph = photoTracerGraphLayers(jpeg);
      const activePhoto = Option.getOrThrow(engine.activePhoto);

      const photoLibraryLayer = PhotoLibraryLive.pipe(
        Layer.provide([
          Layer.succeed(LibraryStore, libraries),
          Layer.succeed(PhotoStore, photos),
          graph.token,
          graph.photo,
        ]),
      );

      const resource = {
        libraryId: activePhoto.libraryId,
        eventId: activePhoto.eventId,
        photoId: activePhoto.photoId,
      };

      const opened = yield* PhotoLibrary.pipe(
        Effect.flatMap((library) =>
          Effect.all({
            photo: library.getPhoto(photoTracerAccount, resource),
            preview: library
              .previewPhoto(photoTracerAccount, resource)
              .pipe(Effect.flatMap(Stream.runCollect)),
          }),
        ),
        Effect.provide(photoLibraryLayer),
      );

      return { engine, opened, selection: selection.selection };
    }).pipe(Effect.provide(photoTracerPersistenceLayer(database))),
  );
}
