import { Context, Effect, Layer, Option, Predicate, Result, Schedule, Stream } from "effect";
import type { Redacted } from "effect";
import { MicrosoftGraphPhotoApi } from "../graph/microsoft-graph-photo-api.ts";
import { inspectJpeg } from "../jpeg/jpeg-codec.ts";
import { JpegSourceUnavailable } from "../jpeg/errors.ts";
import type { ReplayableJpeg } from "../jpeg/model.ts";
import type { GraphReauthenticationRequired, OneDriveUnavailable } from "../library/errors.ts";
import { OneDriveUnavailable as OneDriveUnavailableError } from "../library/errors.ts";
import { DriveItemId } from "../library/model.ts";
import type { DriveId } from "../library/model.ts";
import type { HydratedFile, PhotoHydrationCandidate } from "./model.ts";
import {
  EventId,
  NotReviewableFile,
  PhotoContentTag,
  PhotoEntityTag,
  PhotoId,
  ProjectionRevision,
  ReviewablePhoto,
} from "./model.ts";

/** Server-side reader that turns one staged Graph file into review-facing Foto details. */
export interface PhotoHydratorService {
  readonly hydrate: (
    token: Redacted.Redacted,
    driveId: DriveId,
    candidate: PhotoHydrationCandidate,
  ) => Effect.Effect<HydratedFile, GraphReauthenticationRequired | OneDriveUnavailable>;
}

/** Server-side reader that turns one staged Graph file into review-facing Foto details. */
export class PhotoHydrator extends Context.Service<PhotoHydrator, PhotoHydratorService>()(
  "throwback/photo/PhotoHydrator",
) {}

function unavailable(): OneDriveUnavailableError {
  return new OneDriveUnavailableError({
    message: "OneDrive kan de Foto nu niet veilig hydrateren. Probeer het opnieuw.",
  });
}

function sourceUnavailable(): JpegSourceUnavailable {
  return new JpegSourceUnavailable({
    operation: "Graph Foto download",
    message: "De JPEG-bron kon niet veilig worden gelezen.",
  });
}

/** Compose Graph item details with bounded canonical JPEG metadata inspection. */
export const PhotoHydratorLive = Layer.effect(
  PhotoHydrator,
  Effect.gen(function* () {
    const graph = yield* MicrosoftGraphPhotoApi;

    const hydrate = Effect.fn("PhotoHydrator.hydrate")(function* (
      token: Redacted.Redacted,
      driveId: DriveId,
      candidate: PhotoHydrationCandidate,
    ) {
      const expectedPhotoId = DriveItemId.make(candidate.photoId);
      const expectedParentId = DriveItemId.make(candidate.eventId);

      const fileOption = yield* graph.getFile(token, driveId, expectedPhotoId).pipe(
        Effect.asSome,
        Effect.catchTag("PhotoNotFound", () => Effect.succeed(Option.none())),
      );

      const notReviewable = () =>
        NotReviewableFile.make({
          photoId: candidate.photoId,
        });

      if (Option.isNone(fileOption)) {
        return notReviewable();
      }

      const file = fileOption.value;

      if (Option.getOrElse(file.mimeType, () => "").toLowerCase() !== "image/jpeg") {
        return notReviewable();
      }

      if (
        file.id !== expectedPhotoId ||
        Option.isNone(file.parentItemId) ||
        file.parentItemId.value !== expectedParentId ||
        Option.isNone(file.cTag) ||
        Option.isNone(file.eTag) ||
        Option.isNone(file.downloadUrl)
      ) {
        return notReviewable();
      }

      const parentItemId = file.parentItemId.value;
      const cTag = file.cTag.value;
      const eTag = file.eTag.value;
      const downloadUrl = file.downloadUrl.value;

      const source: ReplayableJpeg = {
        open: Effect.fnUntraced(function* () {
          const content = yield* graph
            .download(downloadUrl)
            .pipe(
              Effect.mapError(sourceUnavailable),
              Effect.map(Stream.mapError(sourceUnavailable)),
            );

          return yield* Stream.toReadableStreamEffect(content);
        }),
      };

      const inspection = yield* inspectJpeg(source).pipe(
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential("1 second", 4).pipe(Schedule.jittered),
          while: Predicate.isTagged("JpegSourceUnavailable"),
        }),
        Effect.result,
      );

      if (Result.isFailure(inspection)) {
        if (Predicate.isTagged("JpegSourceUnavailable")(inspection.failure)) {
          return yield* unavailable();
        }

        return notReviewable();
      }

      return ReviewablePhoto.make({
        photoId: PhotoId.make(file.id),
        eventId: EventId.make(parentItemId),
        fileName: file.name,
        description: inspection.success.metadata.description,
        location: inspection.success.metadata.location,
        orientation: inspection.success.metadata.orientation,
        cTag: PhotoContentTag.make(cTag),
        eTag: PhotoEntityTag.make(eTag),
        projectionRevision: ProjectionRevision.make(1),
      });
    });

    return PhotoHydrator.of({ hydrate });
  }),
);
