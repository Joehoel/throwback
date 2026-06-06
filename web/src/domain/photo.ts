import { Schema } from "effect";
import { DriveItemId } from "./ids.ts";

/**
 * Core domain schemas for the Curation webapp. See docs/design/domain-model.md §2.
 * "Missing" is `null` (NullOr), which maps 1:1 to nullable D1 columns and the
 * review-queue predicate (`WHERE description IS NULL`) — no boolean flags.
 */

/**
 * GPS location, read only via the derived Graph `location` facet — never raw EXIF
 * (ADR-0008). Default at Event level, override per Photo.
 */
export const Location = Schema.Struct({
  latitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -90, maximum: 90 }))),
  longitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -180, maximum: 180 }))),
  altitude: Schema.optionalKey(Schema.Number),
});
export type Location = typeof Location.Type;

/** Approved per-photo caption text — `driveItem.description` (ADR-0002). */
export const Description = Schema.NonEmptyString;
export type Description = typeof Description.Type;

/**
 * AI suggestion, not yet approved — a distinct concept from Description (approved),
 * same shape. The model that produced it is a config/telemetry concern, not part
 * of the domain value (ADR-0012).
 */
export const Suggestion = Schema.NonEmptyString;
export type Suggestion = typeof Suggestion.Type;

/** Per-photo review state, survives sessions (ADR-0009). */
export const ReviewStatus = Schema.Literals(["needs_review", "handled", "skipped"]);
export type ReviewStatus = typeof ReviewStatus.Type;

/** The index projection of a driveItem as the webapp curates it. */
export const Photo = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  folderId: DriveItemId,
  year: Schema.NullOr(Schema.Int), // from the year folder (path-only); null = "year unknown"
  mimeType: Schema.String, // location/orientation write is JPEG-only (ADR-0008/0011)
  description: Schema.NullOr(Description), // null = no Description yet — drives the review queue
  location: Schema.NullOr(Location), // null = no Location yet
  reviewStatus: ReviewStatus,
});
export type Photo = typeof Photo.Type;

/** The deepest folder; its name is the title. Carries the default Location. */
export const Event = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  year: Schema.Int,
  defaultLocation: Schema.NullOr(Location),
});
export type Event = typeof Event.Type;
