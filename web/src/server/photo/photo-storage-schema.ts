import { Schema, SchemaTransformation } from "effect";
import { MetadataLocation } from "../jpeg/model.ts";
import { Photo } from "./model.ts";

/** Parsed persistence representation of one eligible Foto projection. */
export const StoredReviewablePhoto = Schema.Struct({
  libraryId: Schema.String,
  eventId: Schema.String,
  photoId: Schema.String,
  fileName: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  latitude: Schema.NullOr(MetadataLocation.fields.latitude),
  longitude: Schema.NullOr(MetadataLocation.fields.longitude),
  orientation: Photo.fields.orientation,
  cTag: Schema.String,
  eTag: Schema.String,
  projectionRevision: Schema.Int,
}).pipe(
  Schema.decodeTo(
    Photo,
    SchemaTransformation.transform({
      decode: (row) => ({
        libraryId: row.libraryId,
        eventId: row.eventId,
        photoId: row.photoId,
        fileName: row.fileName,
        description: row.description,
        location:
          row.latitude === null || row.longitude === null
            ? null
            : { latitude: row.latitude, longitude: row.longitude },
        orientation: row.orientation,
        cTag: row.cTag,
        eTag: row.eTag,
        projectionRevision: row.projectionRevision,
      }),
      encode: (photo) => ({
        libraryId: photo.libraryId,
        eventId: photo.eventId,
        photoId: photo.photoId,
        fileName: photo.fileName,
        description: photo.description,
        latitude: photo.location?.latitude ?? null,
        longitude: photo.location?.longitude ?? null,
        orientation: photo.orientation,
        cTag: photo.cTag,
        eTag: photo.eTag,
        projectionRevision: photo.projectionRevision,
      }),
    }),
  ),
);

/** Parsed persistence representation of one eligible Foto projection. */
export type StoredReviewablePhoto = typeof StoredReviewablePhoto.Encoded;

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
