import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Effect, Layer, Option, Predicate, Redacted, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { MicrosoftGraphPhotoApi } from "../graph/microsoft-graph-photo-api.ts";
import { DriveId, DriveItemId } from "../library/model.ts";
import { PhotoHydrator, PhotoHydratorLive } from "./photo-hydrator.ts";
import { EventId, NotReviewableFile, PhotoId } from "./model.ts";

const richJpegPath = fileURLToPath(
  new URL("../jpeg/fixtures/little-endian-rich.jpg", import.meta.url),
);

describe("Foto hydration", () => {
  it("reads canonical metadata and the first provider projection tags from a bounded JPEG stream", async () => {
    const jpeg = new Uint8Array(await readFile(richJpegPath));

    const graphLayer = Layer.succeed(MicrosoftGraphPhotoApi, {
      getFile: () =>
        Effect.succeed({
          id: DriveItemId.make("photo-a"),
          name: "familie.jpg",
          parentItemId: Option.some(DriveItemId.make("event-a")),
          mimeType: Option.some("image/jpeg"),
          cTag: Option.some("ctag-a"),
          eTag: Option.some("etag-a"),
          downloadUrl: Option.some(Redacted.make("https://content.example.test/private-jpeg")),
        }),
      download: () => Effect.succeed(Stream.make(jpeg)),
    });

    const hydrated = await Effect.runPromise(
      PhotoHydrator.pipe(
        Effect.flatMap((reader) =>
          reader.hydrate(Redacted.make("server-only-token"), DriveId.make("drive-a"), {
            photoId: PhotoId.make("photo-a"),
            eventId: EventId.make("event-a"),
          }),
        ),
        Effect.provide(PhotoHydratorLive.pipe(Layer.provide(graphLayer))),
      ),
    );

    expect(Predicate.isTagged("ReviewablePhoto")(hydrated)).toBe(true);
    expect(hydrated).toMatchObject({
      photoId: "photo-a",
      eventId: "event-a",
      description: "Oud café",
      orientation: 6,
      cTag: "ctag-a",
      eTag: "etag-a",
      projectionRevision: 1,
    });

    const latitude = Predicate.isTagged("ReviewablePhoto")(hydrated)
      ? hydrated.location?.latitude
      : undefined;

    expect(latitude).toBeCloseTo(52.1, 6);
  });

  it("marks non-JPEG files complete without opening their content", async () => {
    const graphLayer = Layer.succeed(MicrosoftGraphPhotoApi, {
      getFile: () =>
        Effect.succeed({
          id: DriveItemId.make("text-a"),
          name: "notes.txt",
          parentItemId: Option.some(DriveItemId.make("event-a")),
          mimeType: Option.some("text/plain"),
          cTag: Option.some("ctag-a"),
          eTag: Option.some("etag-a"),
          downloadUrl: Option.none(),
        }),
      download: () => Effect.die("non-JPEG content must not be opened"),
    });

    const hydrated = await Effect.runPromise(
      PhotoHydrator.pipe(
        Effect.flatMap((reader) =>
          reader.hydrate(Redacted.make("server-only-token"), DriveId.make("drive-a"), {
            photoId: PhotoId.make("text-a"),
            eventId: EventId.make("event-a"),
          }),
        ),
        Effect.provide(PhotoHydratorLive.pipe(Layer.provide(graphLayer))),
      ),
    );

    expect(hydrated).toEqual(NotReviewableFile.make({ photoId: PhotoId.make("text-a") }));
  });

  it("excludes a JPEG moved outside its staged parent before hydration", async () => {
    const graphLayer = Layer.succeed(MicrosoftGraphPhotoApi, {
      getFile: () =>
        Effect.succeed({
          id: DriveItemId.make("photo-a"),
          name: "familie.jpg",
          parentItemId: Option.some(DriveItemId.make("outside-root")),
          mimeType: Option.some("image/jpeg"),
          cTag: Option.some("ctag-a"),
          eTag: Option.some("etag-a"),
          downloadUrl: Option.some(Redacted.make("https://content.example.test/private-jpeg")),
        }),
      download: () => Effect.die("out-of-scope content must not be opened"),
    });

    const hydrated = await Effect.runPromise(
      PhotoHydrator.pipe(
        Effect.flatMap((reader) =>
          reader.hydrate(Redacted.make("server-only-token"), DriveId.make("drive-a"), {
            photoId: PhotoId.make("photo-a"),
            eventId: EventId.make("event-a"),
          }),
        ),
        Effect.provide(PhotoHydratorLive.pipe(Layer.provide(graphLayer))),
      ),
    );

    expect(hydrated).toEqual(NotReviewableFile.make({ photoId: PhotoId.make("photo-a") }));
  });
});
