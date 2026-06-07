import { Context, Effect, Layer, Ref, Schema } from "effect";
import { PhotoMetadata } from "#/domains/metadata/codec.ts";
import { blobToBinaryString } from "#/domains/metadata/binary.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
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
 * The crawl is an Effect that takes its collaborators from the environment rather
 * than threading them: `PhotoMetadata` (read) + `CrawlSink` (the per-ingest
 * accumulator), both provided in `ingest`.
 */

// Only the EXIF/XMP header is needed to read facts — avoid loading whole files into a string.
const HEADER_BYTES = 256 * 1024;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

const YEAR_SEGMENT = /^(?:19|20)\d{2}$/u;

/** The per-ingest accumulator the crawl writes into — provided as a requirement. */
interface CrawlSinkApi {
  readonly emit: (id: string, source: unknown, handle: FileSystemFileHandle) => Effect.Effect<void>;
  readonly drain: Effect.Effect<{
    readonly sources: readonly unknown[];
    readonly registry: ReadonlyMap<string, FileSystemFileHandle>;
  }>;
}
class CrawlSink extends Context.Service<CrawlSink, CrawlSinkApi>()("CrawlSink") {}

/** A fresh sink (encapsulated mutable accumulation) for one crawl. */
const makeCrawlSink = Effect.sync(() => {
  const sources: unknown[] = [];
  const registry = new Map<string, FileSystemFileHandle>();
  return CrawlSink.of({
    emit: (id, source, handle) =>
      Effect.sync(() => {
        registry.set(id, handle);
        sources.push(source);
      }),
    drain: Effect.sync(() => ({ sources, registry })),
  });
});

/** Snapshot a directory's async-iterated entries into an array. */
async function collectEntries(
  dir: FileSystemDirectoryHandle,
): Promise<(FileSystemFileHandle | FileSystemDirectoryHandle)[]> {
  const entries: (FileSystemFileHandle | FileSystemDirectoryHandle)[] = [];
  for await (const handle of dir.values()) {
    entries.push(handle);
  }
  return entries;
}

/** Read one image file's header and emit a decode-ready source into the sink. */
function ingestFile(
  handle: FileSystemFileHandle,
  pathSegments: readonly string[],
): Effect.Effect<void, LocalSourceError, PhotoMetadata | CrawlSink> {
  return Effect.gen(function* () {
    const metadata = yield* PhotoMetadata;
    const sink = yield* CrawlSink;
    const prepared = yield* Effect.tryPromise({
      try: async (): Promise<{ mimeType: string; binary: string } | null> => {
        const file = await handle.getFile();
        const ext = handle.name.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = file.type === "" ? (EXT_MIME[ext] ?? "") : file.type;
        if (mimeType.startsWith("image/")) {
          return { mimeType, binary: await blobToBinaryString(file.slice(0, HEADER_BYTES)) };
        }
        return null;
      },
      catch: (cause) => new LocalSourceError({ operation: "crawl", message: String(cause) }),
    });
    if (prepared !== null) {
      const facts = yield* metadata.read(prepared.binary);
      const yearFromPath = pathSegments.find((segment) => YEAR_SEGMENT.test(segment));
      const id = [...pathSegments, handle.name].join("/");
      yield* sink.emit(
        id,
        {
          id,
          name: handle.name,
          folderId: pathSegments.join("/"),
          mimeType: prepared.mimeType,
          year: yearFromPath === undefined ? facts.year : Number(yearFromPath),
          description: facts.description,
          location: facts.location,
        },
        handle,
      );
    }
  });
}

/** Recursively crawl a directory, emitting image files; folders are descended. */
function crawl(
  dir: FileSystemDirectoryHandle,
  pathSegments: readonly string[],
): Effect.Effect<void, LocalSourceError, PhotoMetadata | CrawlSink> {
  return Effect.gen(function* () {
    const entries = yield* Effect.tryPromise({
      try: () => collectEntries(dir),
      catch: (cause) => new LocalSourceError({ operation: "crawl", message: String(cause) }),
    });
    yield* Effect.forEach(
      entries,
      (handle) =>
        handle.kind === "directory"
          ? crawl(handle, [...pathSegments, handle.name])
          : ingestFile(handle, pathSegments),
      { discard: true },
    );
  });
}

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

      const sink = yield* makeCrawlSink;
      yield* crawl(rootHandle, [rootHandle.name]).pipe(
        Effect.provideService(CrawlSink, sink),
        Effect.provideService(PhotoMetadata, metadata),
      );
      const crawled = yield* sink.drain;

      const photos = yield* Effect.forEach(crawled.sources, (source) =>
        Schema.decodeUnknownEffect(PhotoFromLocalFile)(source).pipe(
          Effect.mapError(
            (cause) => new LocalSourceError({ operation: "decode", message: String(cause) }),
          ),
        ),
      );

      yield* Ref.set(registry, new Map(crawled.registry));
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

    return PhotoSource.of({ ingest, getFile });
  }),
);

export const LocalPhotoSourceLive = Layer.effect(PhotoSource)(make);
