import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { DriveItemId } from "#/domains/shared/ids.ts";
import { LocalPhotoSourceLive } from "./client.ts";
import { PhotoSource } from "./source.ts";
import { fileFromBinary, jpegBinaryWithExif } from "./__fixtures__/jpeg.ts";

/**
 * The local source over fake File System Access handles — no real browser/folder.
 * Drives the *real* `PhotoSource` pipeline (crawl → EXIF read → domain projection →
 * folder tree) through its public interface, so the test survives refactors of the
 * internals.
 */

const fileHandle = (name: string, file: File): FileSystemFileHandle =>
  ({ kind: "file", name, getFile: () => Promise.resolve(file) }) as unknown as FileSystemFileHandle;

const dirHandle = (
  name: string,
  entries: ReadonlyArray<FileSystemFileHandle | FileSystemDirectoryHandle>,
): FileSystemDirectoryHandle =>
  ({
    kind: "directory",
    name,
    async *values() {
      yield* entries;
    },
    queryPermission: () => Promise.resolve("granted"),
    requestPermission: () => Promise.resolve("granted"),
  }) as unknown as FileSystemDirectoryHandle;

// A picked "Vakantie" folder: a top-level PNG, a non-image (ignored), a year
// subfolder, and a non-year subfolder.
const lake = fileFromBinary(
  "lake.jpg",
  jpegBinaryWithExif({
    lat: 50.0875,
    lon: 14.4214,
    orientation: 6,
    dateTimeOriginal: "2021:07:01 10:00:00",
    description: "Aan het meer",
  }),
  "image/jpeg",
);
const beach = fileFromBinary(
  "beach.jpg",
  jpegBinaryWithExif({ dateTimeOriginal: "2018:05:01 09:00:00" }),
  "image/jpeg",
);
const top = fileFromBinary("top.png", "PNG\r\n not a real png", "image/png");
const notes = fileFromBinary("notes.txt", "hello", "text/plain");

const root = dirHandle("Vakantie", [
  fileHandle("top.png", top),
  fileHandle("notes.txt", notes),
  dirHandle("2019", [fileHandle("lake.jpg", lake)]),
  dirHandle("no-year", [fileHandle("beach.jpg", beach)]),
]);

layer(LocalPhotoSourceLive)("LocalPhotoSource", (it) => {
  it.effect("crawls images into Photos, skipping non-images", () =>
    Effect.gen(function* () {
      const { photos } = yield* PhotoSource.use((s) => s.ingest(root));
      expect(
        photos
          .map((p) => p.id)
          .sort()
          .join(","),
      ).toBe("Vakantie/2019/lake.jpg,Vakantie/no-year/beach.jpg,Vakantie/top.png");
    }),
  );

  it.effect("prefers the year folder over EXIF, and reads EXIF location/description", () =>
    Effect.gen(function* () {
      const { photos } = yield* PhotoSource.use((s) => s.ingest(root));
      const lakePhoto = photos.find((p) => p.id === "Vakantie/2019/lake.jpg");
      expect(lakePhoto?.folderId).toBe("Vakantie/2019");
      expect(lakePhoto?.year).toBe(2019); // path "2019" wins over EXIF 2021
      expect(lakePhoto?.mimeType).toBe("image/jpeg");
      expect(lakePhoto?.description).toBe("Aan het meer");
      expect(lakePhoto?.location?.latitude).toBeCloseTo(50.0875, 3);
      expect(lakePhoto?.reviewStatus).toBe("needs_review");
    }),
  );

  it.effect("falls back to the EXIF capture year when no year folder is present", () =>
    Effect.gen(function* () {
      const { photos } = yield* PhotoSource.use((s) => s.ingest(root));
      const beachPhoto = photos.find((p) => p.id === "Vakantie/no-year/beach.jpg");
      expect(beachPhoto?.year).toBe(2018);
      expect(beachPhoto?.location).toBeNull();
    }),
  );

  it.effect("leaves year/location/description null when there is no EXIF", () =>
    Effect.gen(function* () {
      const { photos } = yield* PhotoSource.use((s) => s.ingest(root));
      const png = photos.find((p) => p.id === "Vakantie/top.png");
      expect(png?.folderId).toBe("Vakantie");
      expect(png?.year).toBeNull();
      expect(png?.location).toBeNull();
      expect(png?.description).toBeNull();
    }),
  );

  it.effect("builds the navigable folder tree with recursive counts", () =>
    Effect.gen(function* () {
      const { root: tree } = yield* PhotoSource.use((s) => s.ingest(root));
      expect(tree.name).toBe("Vakantie");
      expect(tree.photoCount).toBe(3);
      expect(tree.children.map((child) => child.name)).toEqual(["2019", "no-year"]);
    }),
  );

  it.effect("getFile returns the original file for a crawled photo", () =>
    Effect.gen(function* () {
      yield* PhotoSource.use((s) => s.ingest(root));
      const file = yield* PhotoSource.use((s) =>
        s.getFile(DriveItemId.make("Vakantie/2019/lake.jpg")),
      );
      expect(file.name).toBe("lake.jpg");
    }),
  );

  it.effect("getFile fails with LocalSourceError for an unknown photo", () =>
    Effect.gen(function* () {
      yield* PhotoSource.use((s) => s.ingest(root));
      const error = yield* Effect.flip(
        PhotoSource.use((s) => s.getFile(DriveItemId.make("Vakantie/ghost.jpg"))),
      );
      expect(error._tag).toBe("LocalSourceError");
    }),
  );
});
