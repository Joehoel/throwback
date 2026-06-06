import { Schema, SchemaGetter, SchemaTransformation } from "effect";
import { DriveItemId } from "./ids.ts";
import { Description, Location, Photo } from "./photo.ts";

/**
 * Graph ingest — the crawl source. See docs/design/domain-model.md §3.
 * Graph *omits* keys (so they are optionalKey); the projection turns
 * absent/empty into `null` to match the domain's nullable fields.
 */

const GraphLocationFacet = Schema.Struct({
  latitude: Schema.optionalKey(Schema.Number),
  longitude: Schema.optionalKey(Schema.Number),
  altitude: Schema.optionalKey(Schema.Number),
});

/** The raw Graph driveItem subset we read from the children-crawl. */
export const GraphDriveItem = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  description: Schema.optionalKey(Schema.String), // -> Description (ADR-0002)
  lastModifiedDateTime: Schema.DateTimeUtcFromString, // ISO 8601 -> DateTime.Utc (ADR-0011)
  parentReference: Schema.Struct({ id: DriveItemId, path: Schema.String }),
  file: Schema.optionalKey(Schema.Struct({ mimeType: Schema.String })),
  folder: Schema.optionalKey(Schema.Struct({ childCount: Schema.Number })),
  location: Schema.optionalKey(GraphLocationFacet), // derived GPS facet — never raw EXIF
});
export type GraphDriveItem = typeof GraphDriveItem.Type;

// --- Named value mappers (rule #5: logic lives in transforms, not an imperative body) ---

/** Graph description (possibly "") -> Description | null  ("" = absent). */
const DescriptionFromGraph = Schema.String.pipe(
  Schema.decodeTo(
    Schema.NullOr(Description),
    SchemaTransformation.transform({ decode: (s) => (s ? s : null), encode: (d) => d ?? "" }),
  ),
);

/**
 * Graph location facet -> Location | null (only when both lat & lon are present).
 * Exported so the OneDrive client's `verifyLocation` reuses the same mapper rather
 * than duplicating the lat/lon-presence logic (ADR-0013 rule #5).
 */
export const LocationFromFacet = GraphLocationFacet.pipe(
  Schema.decodeTo(
    Schema.NullOr(Location),
    SchemaTransformation.transform({
      decode: (f) =>
        f.latitude != null && f.longitude != null
          ? { latitude: f.latitude, longitude: f.longitude, ...(f.altitude != null ? { altitude: f.altitude } : {}) }
          : null,
      encode: (l) => l ?? {},
    }),
  ),
);

/** Shallowest YYYY folder segment of a OneDrive path -> Int | null  (null = "year unknown"). */
const YearFromPath = Schema.String.pipe(
  Schema.decodeTo(
    Schema.NullOr(Schema.Int),
    SchemaTransformation.transform({
      decode: (path) => {
        const seg = path.split("/").find((s) => /^(19|20)\d{2}$/.test(s));
        return seg ? Number(seg) : null;
      },
      encode: () => "",
    }),
  ),
);

/** Decoding view of the Graph item: value mappers + struct-level key renames. */
const PhotoSource = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  description: Schema.optionalKey(DescriptionFromGraph),
  location: Schema.optionalKey(LocationFromFacet),
  parentReference: Schema.Struct({
    folderId: DriveItemId,
    year: YearFromPath,
  }).pipe(Schema.encodeKeys({ folderId: "id", year: "path" })),
  file: Schema.optionalKey(Schema.Struct({ mimeType: Schema.String })),
});

/**
 * Project a Graph driveItem onto a Photo. Value logic lives in the mappers above;
 * this only flattens the nested fields + injects defaults. Decode-only ingest
 * (`encode` is forbidden).
 */
export const PhotoFromGraphItem = PhotoSource.pipe(
  Schema.decodeTo(Photo, {
    decode: SchemaGetter.transform((s) => ({
      id: s.id,
      name: s.name,
      folderId: s.parentReference.folderId,
      year: s.parentReference.year,
      mimeType: s.file?.mimeType ?? "application/octet-stream",
      description: s.description ?? null,
      location: s.location ?? null,
      reviewStatus: "needs_review" as const,
    })),
    encode: SchemaGetter.forbidden(() => "Graph ingest is decode-only"),
  }),
);
