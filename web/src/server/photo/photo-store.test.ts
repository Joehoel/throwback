import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  CompleteDeltaContinuation,
  GraphDeltaLink,
  indexProgress,
} from "../library/library-index-model.ts";
import {
  indexGraphConnectionVersion as graphConnectionVersion,
  indexLibrary as library,
  indexNode as node,
  indexRunId as runId,
  indexStoreLayer,
  indexWorkflowId as workflowInstanceId,
  makeIndexDatabase,
} from "../library/library-index-test-support.ts";
import { LibraryIndexStore } from "../library/library-index-store.ts";
import {
  EventId,
  NotReviewableFile,
  PhotoContentTag,
  PhotoEntityTag,
  PhotoId,
  ProjectionRevision,
  ReviewablePhoto,
} from "./model.ts";
import { PhotoStore } from "./photo-store.ts";
import { libraryStoreLayer, photoStoreLayer } from "./photo-store-test-support.ts";
import { selectPhotoTracerLibrary } from "./photo-tracer-selection-test-support.ts";

function testLayer(database: ReturnType<typeof makeIndexDatabase>) {
  return Layer.mergeAll(indexStoreLayer(database), photoStoreLayer(database));
}

const owner = { runId, workflowInstanceId };

const finalDeltaLink = GraphDeltaLink.make("https://graph.example.test/final-delta");

const reviewable = ReviewablePhoto.make({
  photoId: PhotoId.make("photo-jpeg"),
  eventId: EventId.make("event-a"),
  fileName: "familie.jpg",
  description: "Zondagmiddag",
  location: { latitude: 52.0907, longitude: 5.1214 },
  orientation: 6,
  cTag: PhotoContentTag.make("ctag-a"),
  eTag: PhotoEntityTag.make("etag-a"),
  projectionRevision: ProjectionRevision.make(1),
});

describe("active Foto projection store", () => {
  it("traces Hoofdmap selection through blocked progress, atomic activation, and the first real Foto", async () => {
    const database = makeIndexDatabase({ seedLibrary: false });
    const layer = Layer.mergeAll(testLayer(database), libraryStoreLayer(database));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const indexes = yield* LibraryIndexStore;
        const photos = yield* PhotoStore;

        const selection = yield* selectPhotoTracerLibrary;
        const selectedLibrary = selection.library;

        yield* indexes.ensureInitialRun(selectedLibrary, runId, graphConnectionVersion);
        yield* indexes.reserveDispatchAttempt(runId, workflowInstanceId, graphConnectionVersion);
        yield* indexes.claimRun(runId, workflowInstanceId);
        yield* indexes.stagePage({
          ...owner,
          expectedNextLink: Option.none(),
          page: {
            items: [
              node({ id: "selected-root", nodeType: "folder" }),
              node({ id: "event-a", parentId: "selected-root", nodeType: "folder" }),
              node({ id: "photo-jpeg", parentId: "event-a", nodeType: "file" }),
              node({ id: "text-file", parentId: "event-a", nodeType: "file" }),
              node({ id: "outside", nodeType: "folder" }),
              node({ id: "outside-photo", parentId: "outside", nodeType: "file" }),
            ],
            continuation: CompleteDeltaContinuation.make({ link: finalDeltaLink }),
          },
        });

        const indexingRun = yield* indexes.getRun(selectedLibrary.id);

        const firstCandidate = yield* photos.nextStagedFile(owner);
        yield* photos.stageHydratedFile(owner, reviewable);
        const secondCandidate = yield* photos.nextStagedFile(owner);
        yield* photos.stageHydratedFile(
          owner,
          NotReviewableFile.make({
            photoId: PhotoId.make("text-file"),
          }),
        );

        const noCandidate = yield* photos.nextStagedFile(owner);
        const beforeActivation = yield* photos.firstReviewablePhoto(selectedLibrary.id);
        const activated = yield* photos.activateHydratedGeneration(owner);

        return {
          activated,
          beforeActivation,
          selectionProgress: selection.progress,
          indexingProgress: Option.map(indexingRun, indexProgress),
          firstCandidate,
          noCandidate,
          selectedLibraryId: selectedLibrary.id,
          secondCandidate,
          activeRun: yield* indexes.getRun(selectedLibrary.id),
          firstPhoto: yield* photos.firstReviewablePhoto(selectedLibrary.id),
          exactPhoto: yield* photos.getReviewablePhoto({
            libraryId: selectedLibrary.id,
            eventId: reviewable.eventId,
            photoId: reviewable.photoId,
          }),
        };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.firstCandidate).toEqual(
      Option.some({ photoId: "photo-jpeg", eventId: "event-a" }),
    );
    expect(result.secondCandidate).toEqual(
      Option.some({ photoId: "text-file", eventId: "event-a" }),
    );
    expect(result.noCandidate).toEqual(Option.none());
    expect(result.beforeActivation).toEqual(Option.none());
    expect(result.selectionProgress).toEqual({
      status: "queued",
      pagesProcessed: 0,
      processedItems: 0,
      reviewBlocked: true,
    });
    expect(result.indexingProgress).toEqual(
      Option.some({
        status: "running",
        pagesProcessed: 1,
        processedItems: 6,
        reviewBlocked: true,
      }),
    );
    expect(result.activated).toBe(true);
    expect(Option.getOrThrow(result.activeRun)).toMatchObject({
      status: "active",
      deltaLink: Option.some(finalDeltaLink),
      pendingDeltaLink: Option.none(),
    });
    expect(Option.getOrThrow(result.firstPhoto)).toEqual({
      libraryId: result.selectedLibraryId,
      ...reviewable,
      _tag: undefined,
    });
    expect(result.exactPhoto).toEqual(result.firstPhoto);
  });

  it("refuses activation while a scoped file has no hydration result", async () => {
    const database = makeIndexDatabase();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const indexes = yield* LibraryIndexStore;
        const photos = yield* PhotoStore;

        yield* indexes.ensureInitialRun(library, runId, graphConnectionVersion);
        yield* indexes.reserveDispatchAttempt(runId, workflowInstanceId, graphConnectionVersion);
        yield* indexes.claimRun(runId, workflowInstanceId);
        yield* indexes.stagePage({
          ...owner,
          expectedNextLink: Option.none(),
          page: {
            items: [
              node({ id: "selected-root", nodeType: "folder" }),
              node({ id: "event-a", parentId: "selected-root", nodeType: "folder" }),
              node({ id: "photo-jpeg", parentId: "event-a", nodeType: "file" }),
            ],
            continuation: CompleteDeltaContinuation.make({ link: finalDeltaLink }),
          },
        });

        return {
          activated: yield* photos.activateHydratedGeneration(owner),
          run: yield* indexes.getRun(library.id),
        };
      }).pipe(Effect.provide(testLayer(database))),
    );

    expect(result.activated).toBe(false);
    expect(Option.getOrThrow(result.run)).toMatchObject({
      status: "running",
      activeGeneration: Option.none(),
      pendingDeltaLink: Option.some(finalDeltaLink),
    });
  });
});
