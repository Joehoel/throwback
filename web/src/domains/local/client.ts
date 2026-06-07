import { Effect, Layer, Ref, Schema } from "effect";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import { blobToBinaryString, readExif } from "./exif.ts";
import { buildFolderTree } from "./folder-tree.ts";
import { PhotoFromLocalFile } from "./mapper.ts";
import { LocalSourceError, PhotoSource } from "./source.ts";

/**
 * `LocalPhotoSourceLive` — the browser File System Access implementation of
 * `PhotoSource`. Recursively crawls a picked directory, projecting each image file
 * onto a domain `Photo` (EXIF via piexifjs), and keeps a registry of file handles
 * so `getFile` can re-open the bytes for display and the later EXIF write-back.
 */

// Only the EXIF header is needed to read facts — avoid loading whole files into a string.
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

interface Crawled {
  sources: unknown[];
  registry: Map<string, FileSystemFileHandle>;
}

/** Recursively walk a directory, collecting image files as decode-ready sources. */
async function crawlDir(
  dir: FileSystemDirectoryHandle,
  pathSegments: readonly string[],
  acc: Crawled,
): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === "directory") {
      await crawlDir(handle, [...pathSegments, handle.name], acc);
    } else {
      const file = await handle.getFile();
      const ext = handle.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = file.type === "" ? (EXT_MIME[ext] ?? "") : file.type;
      if (mimeType.startsWith("image/")) {
        const id = [...pathSegments, handle.name].join("/");
        const exif = readExif(await blobToBinaryString(file.slice(0, HEADER_BYTES)));
        const yearFromPath = pathSegments.find((segment) => YEAR_SEGMENT.test(segment));
        acc.registry.set(id, handle);
        acc.sources.push({
          id,
          name: handle.name,
          folderId: pathSegments.join("/"),
          mimeType,
          year: yearFromPath === undefined ? exif.year : Number(yearFromPath),
          description: exif.description,
          location: exif.location,
        });
      }
    }
  }
}

/** Ask once for read-write so the later EXIF write-back doesn't prompt per file. */
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

const make = Ref.make(new Map<string, FileSystemFileHandle>()).pipe(
  Effect.map((registry) => {
    const ingest = Effect.fn("local.ingest")(function* (rootHandle: FileSystemDirectoryHandle) {
      yield* ensurePermission(rootHandle);

      const crawled = yield* Effect.tryPromise({
        try: async (): Promise<Crawled> => {
          const acc: Crawled = { sources: [], registry: new Map() };
          await crawlDir(rootHandle, [rootHandle.name], acc);
          return acc;
        },
        catch: (cause) => new LocalSourceError({ operation: "crawl", message: String(cause) }),
      });

      const photos = yield* Effect.forEach(crawled.sources, (source) =>
        Schema.decodeUnknownEffect(PhotoFromLocalFile)(source).pipe(
          Effect.mapError(
            (cause) => new LocalSourceError({ operation: "decode", message: String(cause) }),
          ),
        ),
      );

      yield* Ref.set(registry, crawled.registry);
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
