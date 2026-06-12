import { Effect, Layer, Option, Ref, Schema, Stream } from "effect";
import { binaryToBytes, blobToBinaryString } from "#/domains/metadata/binary.ts";
import { PhotoMetadata } from "#/domains/metadata/codec.ts";
import type { MetadataEdit } from "#/domains/metadata/codec.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Location } from "#/domains/shared/photo.ts";
import { buildFolderTree } from "./folder-tree.ts";
import { PhotoFromLocalFile } from "./mapper.ts";
import { LocalSourceError, PhotoSource } from "./source.ts";

/**
 * `LocalPhotoSourceLive` — the browser File System Access implementation of
 * `PhotoSource`. Recursively crawls a picked directory, projecting each image file
 * onto a domain `Photo` via the `PhotoMetadata` codec (XMP `dc:description` +
 * EXIF GPS/orientation, ADR-0019), and keeps a registry of file handles so
 * `getFile` can re-open the bytes for display and the later metadata write-back.
 *
 * The crawl is a `Stream` pipeline: `filesUnder` flattens the directory tree into a
 * stream of image candidates, `ingestFile` reads + projects each (concurrently),
 * and `runCollect` gathers the sources + handle registry — no mutable sink, no
 * eager snapshot.
 */

// Only the EXIF/XMP header is needed to read facts — avoid loading whole files into a string.
const HEADER_BYTES = 256 * 1024;

// How many files to read+decode concurrently during a crawl.
const CRAWL_CONCURRENCY = 8;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** The file's MIME type, falling back to its extension when the browser leaves it blank. */
const mimeOf = (file: File, name: string): string => {
  if (file.type !== "") {
    return file.type;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "";
};

/** A file found by the crawl, with its directory path (no filename). */
interface CrawledFile {
  readonly handle: FileSystemFileHandle;
  readonly pathSegments: readonly string[];
}

/** A crawled file's raw, decode-ready inputs (the mapper derives id/folder/year). */
interface LocalSource {
  readonly name: string;
  readonly pathSegments: readonly string[];
  readonly mimeType: string;
  readonly exifYear: number | null;
  readonly description: string | null;
  readonly location: Location | null;
}

/** An ingested image: its decode source plus the registry entry (id → handle). */
interface IngestedFile {
  readonly id: string;
  readonly handle: FileSystemFileHandle;
  readonly source: LocalSource;
}

/** A recursive `Stream` of image-candidate files under a directory (folders descended). */
const filesUnder = (
  dir: FileSystemDirectoryHandle,
  pathSegments: readonly string[],
): Stream.Stream<CrawledFile, LocalSourceError> =>
  Stream.fromAsyncIterable(
    dir.values(),
    (cause) => new LocalSourceError({ operation: "crawl", message: String(cause) }),
  ).pipe(
    Stream.flatMap((entry) =>
      entry.kind === "directory"
        ? filesUnder(entry, [...pathSegments, entry.name])
        : Stream.succeed({ handle: entry, pathSegments }),
    ),
  );

/** Read one image file's header and project it to a decode-ready source; non-images → None. */
const ingestFile = Effect.fn("local.ingestFile")(function* (file: CrawledFile) {
  const metadata = yield* PhotoMetadata;
  const prepared = yield* Effect.tryPromise({
    try: async (): Promise<{ mimeType: string; binary: string } | null> => {
      const blob = await file.handle.getFile();
      const mimeType = mimeOf(blob, file.handle.name);
      if (mimeType.startsWith("image/")) {
        return { mimeType, binary: await blobToBinaryString(blob.slice(0, HEADER_BYTES)) };
      }
      return null;
    },
    catch: (cause) => new LocalSourceError({ operation: "crawl", message: String(cause) }),
  });
  if (prepared === null) {
    return Option.none<IngestedFile>();
  }
  const facts = yield* metadata.read(prepared.binary, prepared.mimeType);
  return Option.some<IngestedFile>({
    id: [...file.pathSegments, file.handle.name].join("/"),
    handle: file.handle,
    source: {
      name: file.handle.name,
      pathSegments: file.pathSegments,
      mimeType: prepared.mimeType,
      exifYear: facts.year,
      description: facts.description,
      location: facts.location,
    },
  });
});

/** Ask once for read-write so the later metadata write-back doesn't prompt per file. */
const ensurePermission = (handle: FileSystemDirectoryHandle) =>
  Effect.tryPromise({
    try: async () => {
      if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") {
        return;
      }
      if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
        throw new Error("read-write permission denied");
      }
    },
    catch: (cause) => new LocalSourceError({ operation: "permission", message: String(cause) }),
  });

const make = Effect.all([Ref.make(new Map<string, FileSystemFileHandle>()), PhotoMetadata]).pipe(
  Effect.map(([registry, metadata]) => {
    const ingest = Effect.fn("local.ingest")(function* (rootHandle: FileSystemDirectoryHandle) {
      yield* ensurePermission(rootHandle);

      const collected = yield* filesUnder(rootHandle, [rootHandle.name]).pipe(
        Stream.mapEffect(ingestFile, { concurrency: CRAWL_CONCURRENCY }),
        Stream.runCollect,
        Effect.provideService(PhotoMetadata, metadata),
      );
      // Drop the non-image Nones, keeping the projected sources.
      const ingested = collected.flatMap((option) => (Option.isSome(option) ? [option.value] : []));

      const photos = yield* Effect.forEach(ingested, (item) =>
        Schema.decodeUnknownEffect(PhotoFromLocalFile)(item.source).pipe(
          Effect.mapError(
            (cause) => new LocalSourceError({ operation: "decode", message: String(cause) }),
          ),
        ),
      );

      yield* Ref.set(registry, new Map(ingested.map((item) => [item.id, item.handle])));
      return { root: buildFolderTree(photos, rootHandle.name), photos };
    });

    const getFile = Effect.fn("local.getFile")(function* (photoId: DriveItemId) {
      const handle = (yield* Ref.get(registry)).get(photoId);
      if (handle === undefined) {
        return yield* Effect.fail(
          new LocalSourceError({ operation: "getFile", message: `unknown photo: ${photoId}` }),
        );
      }
      return yield* Effect.tryPromise({
        try: () => handle.getFile(),
        catch: (cause) => new LocalSourceError({ operation: "getFile", message: String(cause) }),
      });
    });

    const write = Effect.fn("local.write")(function* (photoId: DriveItemId, edit: MetadataEdit) {
      const handle = (yield* Ref.get(registry)).get(photoId);
      if (handle === undefined) {
        return yield* Effect.fail(
          new LocalSourceError({ operation: "write", message: `unknown photo: ${photoId}` }),
        );
      }
      const file = yield* Effect.tryPromise({
        try: () => handle.getFile(),
        catch: (cause) => new LocalSourceError({ operation: "write", message: String(cause) }),
      });
      const binary = yield* Effect.promise(() => blobToBinaryString(file)); // whole file: lossless rewrite
      const next = yield* metadata
        .write(binary, mimeOf(file, handle.name), edit)
        .pipe(
          Effect.mapError(
            (cause) => new LocalSourceError({ operation: "write", message: cause.message }),
          ),
        );
      return yield* Effect.tryPromise({
        try: async () => {
          const writable = await handle.createWritable();
          await writable.write(binaryToBytes(next));
          await writable.close();
        },
        catch: (cause) => new LocalSourceError({ operation: "write", message: String(cause) }),
      });
    });

    return PhotoSource.of({ ingest, getFile, write });
  }),
);

export const LocalPhotoSourceLive = Layer.effect(PhotoSource)(make);
