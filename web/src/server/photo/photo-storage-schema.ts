import { Schema, SchemaTransformation } from "effect";
import { MetadataLocation } from "../jpeg/model.ts";
import { LibraryId } from "../library/model.ts";
import {
  EventId,
  Photo,
  PhotoContentTag,
  PhotoEntityTag,
  PhotoId,
  ProjectionRevision,
} from "./model.ts";

/** Parsed persistence representation of one eligible Foto projection. */
export const StoredReviewablePhoto = Schema.Struct({
  libraryId: LibraryId,
  eventId: EventId,
  photoId: PhotoId,
  fileName: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  latitude: Schema.NullOr(MetadataLocation.fields.latitude),
  longitude: Schema.NullOr(MetadataLocation.fields.longitude),
  orientation: Photo.fields.orientation,
  cTag: PhotoContentTag,
  eTag: PhotoEntityTag,
  projectionRevision: ProjectionRevision,
});

/** Parsed persistence representation of one eligible Foto projection. */
export type StoredReviewablePhoto = typeof StoredReviewablePhoto.Type;

/** Stored publication status used to confirm an atomic activation. */
export const StoredActivation = Schema.Struct({ active: Schema.Literals([0, 1]) }).pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: ({ active }) => active === 1,
      encode: (active) => ({ active: active ? 1 : 0 }),
    }),
  ),
);
