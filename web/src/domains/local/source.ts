import { Context, Schema } from "effect";
import type { Effect } from "effect";
import type { MetadataEdit } from "#/domains/metadata/codec.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import type { FolderNode } from "./folder-tree.ts";

/**
 * `PhotoSource` — the seam the curation UI reads photos through. The local
 * (File System Access) implementation lives in `client.ts`; a OneDrive-backed
 * implementation can satisfy the same interface later, so the UI stays
 * source-agnostic. Consumers depend on this interface, not the layer (ADR-0012).
 *
 * Unlike `OneDriveClient`, this runs entirely in the browser — no auth
 * requirements — because the File System Access API is browser-only.
 */

/** Anything the local source can't do — crawl/permission/decode/file-read failures. */
export class LocalSourceError extends Schema.TaggedErrorClass<LocalSourceError>()(
  "LocalSourceError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

/** The crawl result: the navigable folder tree plus every photo it found. */
export interface IngestResult {
  readonly root: FolderNode;
  readonly photos: readonly Photo[];
}

export interface PhotoSourceApi {
  /**
   * Crawl a picked directory into the folder tree + `Photo[]`. The handle is
   * picked in the UI (a user gesture is required) and handed in here; this
   * requests read-write permission up front so the later EXIF write-back won't
   * re-prompt per file.
   */
  readonly ingest: (
    rootHandle: FileSystemDirectoryHandle,
  ) => Effect.Effect<IngestResult, LocalSourceError>;
  /** The original `File` for a crawled photo — for display (object URL) and EXIF read/write. */
  readonly getFile: (photoId: DriveItemId) => Effect.Effect<File, LocalSourceError>;
  /**
   * Write the approved metadata back into the photo file itself (lossless), via the
   * File System Access writable. The OneDrive sync client on the laptop propagates
   * it (ADR-0019); review bookkeeping stays in D1, not the file.
   */
  readonly write: (
    photoId: DriveItemId,
    edit: MetadataEdit,
  ) => Effect.Effect<void, LocalSourceError>;
}

export class PhotoSource extends Context.Service<PhotoSource, PhotoSourceApi>()("PhotoSource") {}
