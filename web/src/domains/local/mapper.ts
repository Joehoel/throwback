import { Schema, SchemaGetter } from "effect";
import { DriveItemId } from "#/domains/shared/ids.ts";
import { Description, Location, Photo } from "#/domains/shared/photo.ts";

/**
 * Local-folder ingest mapper — the local counterpart to `PhotoFromGraphItem`
 * (graph.ts). The crawl (`client.ts`) does the format extraction (EXIF, paths);
 * this only projects a cleaned local file onto the domain `Photo`, injecting the
 * initial review state. Decode-only, like the Graph ingest.
 *
 * The id-space is reused: a local file's POSIX path from the picked root is branded
 * as `DriveItemId` (it is the stable key here, the same role Graph's driveItem id
 * plays) so the rest of the domain stays untouched.
 */

/** A crawled local file, already EXIF-extracted, before domain projection. */
export const LocalFileSource = Schema.Struct({
  id: DriveItemId, // POSIX path from the picked root, e.g. "Vakantie/2022/img.jpg"
  name: Schema.String,
  folderId: DriveItemId, // parent directory path
  mimeType: Schema.String,
  year: Schema.NullOr(Schema.Int),
  description: Schema.NullOr(Description),
  location: Schema.NullOr(Location),
});
export type LocalFileSource = typeof LocalFileSource.Type;

/** Project a crawled local file onto a Photo (decode-only ingest). */
export const PhotoFromLocalFile = LocalFileSource.pipe(
  Schema.decodeTo(Photo, {
    decode: SchemaGetter.transform((s) => ({ ...s, reviewStatus: "needs_review" as const })),
    encode: SchemaGetter.forbidden(() => "Local ingest is decode-only"),
  }),
);
