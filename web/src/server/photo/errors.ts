import { Schema } from "effect";

/** The requested resource is not an active, reviewable Foto in this Bibliotheek. */
export class PhotoNotFound extends Schema.TaggedError<PhotoNotFound>()(
  "PhotoNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** The staged or active Foto projection could not be read or changed safely. */
export class PhotoProjectionUnavailable extends Schema.TaggedError<PhotoProjectionUnavailable>()(
  "PhotoProjectionUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 },
) {}
