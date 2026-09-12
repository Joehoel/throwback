import { PhotoSource } from "#/domains/local/source.ts";
import type { IngestResult } from "#/domains/local/source.ts";
import type { MetadataEdit } from "#/domains/metadata/codec.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import { LocalRuntime } from "#/effect/client-runtime.ts";

/**
 * The single client-side action seam for the local curate UI: every crossing into
 * the `LocalRuntime` lives here (crawl, read, write) plus the review-status server
 * fns. The React components import these and never touch `LocalRuntime`/`Effect`
 * directly — the runtime runs only at this edge.
 */

export { fetchReviewStatuses, setReviewStatus } from "#/domains/curation/review-server.ts";

export { describeError, mergeReviewStatuses } from "#/domains/local/curate-actions.ts";

/** Crawl a picked directory into the folder tree + `Photo[]`. */
export const ingestFolder = (handle: FileSystemDirectoryHandle): Promise<IngestResult> =>
  LocalRuntime.runPromise(PhotoSource.use((source) => source.ingest(handle)));

/** Re-open a crawled photo's original bytes (for display / object URLs). */
export const readPhotoFile = (photoId: DriveItemId): Promise<File> =>
  LocalRuntime.runPromise(PhotoSource.use((source) => source.getFile(photoId)));

/** Write the approved metadata into the photo file (lossless) via the client runtime. */
export const writePhoto = (photoId: DriveItemId, edit: MetadataEdit): Promise<void> =>
  LocalRuntime.runPromise(PhotoSource.use((source) => source.write(photoId, edit)));

/** The approved edit: trimmed Beschrijving (null if blank); EXIF location preserved. */
export const toApproveEdit = (photo: Photo, description: string): MetadataEdit => {
  const trimmed = description.trim();

  return {
    description: trimmed === "" ? null : trimmed,
    location: photo.location,
    orientation: null,
  };
};
