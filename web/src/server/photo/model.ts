import { Schema } from "effect";
import { MetadataLocation, Orientation } from "../jpeg/model.ts";
import { LibraryId } from "../library/model.ts";

/** Stable Graph folder identity used by a Foto bookmark. */
export const EventId = Schema.NonEmptyString.pipe(Schema.brand("EventId")).annotate({
  format: "throwback-event-id",
  identifier: "EventId",
});

/** Stable Graph folder identity used by a Foto bookmark. */
export type EventId = typeof EventId.Type;

/** Stable Graph file identity used by a Foto bookmark. */
export const PhotoId = Schema.NonEmptyString.pipe(Schema.brand("PhotoId")).annotate({
  format: "throwback-photo-id",
  identifier: "PhotoId",
});

/** Stable Graph file identity used by a Foto bookmark. */
export type PhotoId = typeof PhotoId.Type;

/** Monotone revision of canonical metadata projected from one Foto. */
export const ProjectionRevision = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("ProjectionRevision"),
);

/** Monotone revision of canonical metadata projected from one Foto. */
export type ProjectionRevision = typeof ProjectionRevision.Type;

/** Provider content tag captured with the projected JPEG metadata. */
export const PhotoContentTag = Schema.NonEmptyString.pipe(Schema.brand("PhotoContentTag"));

/** Provider content tag captured with the projected JPEG metadata. */
export type PhotoContentTag = typeof PhotoContentTag.Type;

/** Provider entity tag captured with the projected JPEG metadata. */
export const PhotoEntityTag = Schema.NonEmptyString.pipe(Schema.brand("PhotoEntityTag"));

/** Provider entity tag captured with the projected JPEG metadata. */
export type PhotoEntityTag = typeof PhotoEntityTag.Type;

/** Canonical active Foto projection returned to the Curator. */
export const Photo = Schema.Struct({
  libraryId: LibraryId,
  eventId: EventId,
  photoId: PhotoId,
  fileName: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  location: Schema.NullOr(MetadataLocation),
  orientation: Orientation,
  cTag: PhotoContentTag,
  eTag: PhotoEntityTag,
  projectionRevision: ProjectionRevision,
}).annotate({ identifier: "Photo" });

/** Canonical active Foto projection returned to the Curator. */
export type Photo = typeof Photo.Type;

/** Exact nominal identities of one Foto resource URL. */
export const PhotoResource = Schema.Struct({
  libraryId: LibraryId,
  eventId: EventId,
  photoId: PhotoId,
});

/** Exact nominal identities of one Foto resource URL. */
export type PhotoResource = typeof PhotoResource.Type;

/** Staged file identity and expected parent captured by the delta snapshot. */
export const PhotoHydrationCandidate = Schema.Struct({
  photoId: PhotoId,
  eventId: EventId,
});

/** Staged file identity and expected parent captured by the delta snapshot. */
export type PhotoHydrationCandidate = typeof PhotoHydrationCandidate.Type;

/** Completed hydration marker for a staged file that is not a safe JPEG Foto. */
export const NotReviewableFile = Schema.TaggedStruct("NotReviewable", {
  photoId: PhotoId,
});

/** Complete canonical metadata and provider tags for one staged JPEG Foto. */
export const ReviewablePhoto = Schema.TaggedStruct("ReviewablePhoto", {
  photoId: PhotoId,
  eventId: EventId,
  fileName: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  location: Schema.NullOr(MetadataLocation),
  orientation: Orientation,
  cTag: PhotoContentTag,
  eTag: PhotoEntityTag,
  projectionRevision: ProjectionRevision,
});

/** Review-facing result of hydrating one staged file. */
export const HydratedFile = Schema.Union([NotReviewableFile, ReviewablePhoto]);

/** Review-facing result of hydrating one staged file. */
export type HydratedFile = typeof HydratedFile.Type;
