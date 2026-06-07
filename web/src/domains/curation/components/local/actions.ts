import { Effect } from "effect";
import { fetchReviewStatuses, setReviewStatus } from "#/domains/curation/review-server.ts";
import { mergeReviewStatuses } from "#/domains/local/curate-actions.ts";
import { PhotoSource } from "#/domains/local/source.ts";
import type { MetadataEdit } from "#/domains/metadata/codec.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import { LocalRuntime } from "#/effect/client-runtime.ts";

/** The client-side action seam for the local curate UI (runtime calls + server fns). */

export { fetchReviewStatuses, mergeReviewStatuses, setReviewStatus };

/** Write the approved metadata into the photo file (lossless) via the client runtime. */
export const writePhoto = (photoId: DriveItemId, edit: MetadataEdit): Promise<void> =>
  LocalRuntime.runPromise(Effect.flatMap(PhotoSource, (source) => source.write(photoId, edit)));

/** The approved edit: trimmed Beschrijving (null if blank); EXIF location preserved. */
export const toApproveEdit = (photo: Photo, description: string): MetadataEdit => {
  const trimmed = description.trim();
  return {
    description: trimmed === "" ? null : trimmed,
    location: photo.location,
    orientation: null,
  };
};
