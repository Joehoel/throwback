import { Schema, SchemaGetter } from "effect";
import { Description, Location, Photo } from "#/domains/shared/photo.ts";

/**
 * Local-folder ingest mapper — the local counterpart to `PhotoFromGraphItem`
 * (graph.ts). It owns the whole `Photo` projection from *raw* crawl inputs: the
 * crawl (`client.ts`) only reads bytes + collects the path, this derives the id,
 * folder, and year (path-year wins over the EXIF year) and injects the initial
 * review state. Decode-only, like the Graph ingest — keeps the derivation in one
 * declarative place instead of split across the crawl loop (ADR-0013).
 *
 * The id-space is reused: a local file's POSIX path from the picked root is branded
 * as `DriveItemId` (the stable key here, the role Graph's driveItem id plays).
 */

/** A crawled local file before domain projection: raw inputs, not yet a Photo. */
export const LocalFileSource = Schema.Struct({
  name: Schema.String,
  pathSegments: Schema.Array(Schema.String), // directory path from the picked root (no filename)
  mimeType: Schema.String,
  exifYear: Schema.NullOr(Schema.Int), // year parsed from the EXIF capture date
  description: Schema.NullOr(Description),
  location: Schema.NullOr(Location),
});
export type LocalFileSource = typeof LocalFileSource.Type;

/** A 4-digit year folder (19xx/20xx). The path year wins over EXIF when present. */
const YEAR_SEGMENT = /^(?:19|20)\d{2}$/u;
const yearFor = (segments: readonly string[], exifYear: number | null): number | null => {
  const fromPath = segments.find((segment) => YEAR_SEGMENT.test(segment));
  return fromPath === undefined ? exifYear : Number(fromPath);
};

/** Project a crawled local file onto a Photo (decode-only); id/folder/year derived here. */
export const PhotoFromLocalFile = LocalFileSource.pipe(
  Schema.decodeTo(Photo, {
    decode: SchemaGetter.transform((source) => ({
      id: [...source.pathSegments, source.name].join("/"),
      name: source.name,
      folderId: source.pathSegments.join("/"),
      mimeType: source.mimeType,
      year: yearFor(source.pathSegments, source.exifYear),
      description: source.description,
      location: source.location,
      reviewStatus: "needs_review" as const,
    })),
    encode: SchemaGetter.forbidden(() => "Local ingest is decode-only"),
  }),
);
