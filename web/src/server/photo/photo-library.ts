import { Context, Effect, Layer, Option } from "effect";
import type { Stream } from "effect";
import type { SignedInMicrosoftAccount } from "../curator/model.ts";
import { GraphAccessToken } from "../graph/graph-token.ts";
import { MicrosoftGraphPhotoApi } from "../graph/microsoft-graph-photo-api.ts";
import type {
  GraphReauthenticationRequired,
  LibraryStoreUnavailable,
  OneDriveUnavailable,
} from "../library/errors.ts";
import { LibraryStore } from "../library/library-store.ts";
import { DriveItemId } from "../library/model.ts";
import { PhotoNotFound } from "./errors.ts";
import type { PhotoProjectionUnavailable } from "./errors.ts";
import type { Photo, PhotoResource } from "./model.ts";
import { PhotoStore } from "./photo-store.ts";

type PhotoReadError = PhotoNotFound | PhotoProjectionUnavailable | LibraryStoreUnavailable;

type PhotoPreviewError = PhotoReadError | GraphReauthenticationRequired | OneDriveUnavailable;

/** Authorized read and JPEG-preview operations for active Fotos. */
export interface PhotoLibraryService {
  readonly getPhoto: (
    account: SignedInMicrosoftAccount,
    resource: PhotoResource,
  ) => Effect.Effect<Photo, PhotoReadError>;
  readonly previewPhoto: (
    account: SignedInMicrosoftAccount,
    resource: PhotoResource,
  ) => Effect.Effect<Stream.Stream<Uint8Array, OneDriveUnavailable>, PhotoPreviewError>;
}

/** Authorized read and JPEG-preview operations for active Fotos. */
export class PhotoLibrary extends Context.Service<PhotoLibrary, PhotoLibraryService>()(
  "throwback/photo/PhotoLibrary",
) {}

function notFound(operation: "preview" | "read"): PhotoNotFound {
  return new PhotoNotFound({
    message: "Deze Foto staat niet in de actieve reviewqueue. Ga terug naar de Bibliotheek.",
    subsystem: "photo",
    operation,
    retryable: false,
  });
}

/** Compose active projection reads with server-only Graph preview access. */
export const PhotoLibraryLive = Layer.effect(
  PhotoLibrary,
  Effect.gen(function* () {
    const libraries = yield* LibraryStore;
    const photos = yield* PhotoStore;
    const tokens = yield* GraphAccessToken;
    const graph = yield* MicrosoftGraphPhotoApi;

    const requireLibrary = Effect.fnUntraced(function* (
      account: SignedInMicrosoftAccount,
      resource: PhotoResource,
      operation: "preview" | "read",
    ) {
      const library = yield* libraries.getSelected(account.identity);

      if (Option.isNone(library) || library.value.id !== resource.libraryId) {
        return yield* notFound(operation);
      }

      return library.value;
    });

    const getPhoto = Effect.fn("PhotoLibrary.getPhoto")(function* (
      account: SignedInMicrosoftAccount,
      resource: PhotoResource,
    ) {
      yield* requireLibrary(account, resource, "read");
      const photo = yield* photos.getReviewablePhoto(resource);

      return yield* Option.match(photo, {
        onNone: () => notFound("read"),
        onSome: Effect.succeed,
      });
    });

    const previewPhoto = Effect.fn("PhotoLibrary.previewPhoto")(function* (
      account: SignedInMicrosoftAccount,
      resource: PhotoResource,
    ) {
      const library = yield* requireLibrary(account, resource, "preview");
      const photo = yield* getPhoto(account, resource);

      const token = yield* tokens.get(account);
      const file = yield* graph.getFile(token, library.driveId, DriveItemId.make(resource.photoId));

      if (
        Option.getOrElse(file.mimeType, () => "").toLowerCase() !== "image/jpeg" ||
        !Option.contains(file.parentItemId, DriveItemId.make(resource.eventId)) ||
        !Option.contains(file.cTag, photo.cTag) ||
        !Option.contains(file.eTag, photo.eTag) ||
        Option.isNone(file.downloadUrl)
      ) {
        return yield* notFound("preview");
      }

      return yield* graph.download(file.downloadUrl.value);
    });

    return PhotoLibrary.of({ getPhoto, previewPhoto });
  }),
);
