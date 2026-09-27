import { Schema } from "effect";

/** The requested resource is not an active, reviewable Foto in this Bibliotheek. */
export class PhotoNotFound extends Schema.TaggedError<PhotoNotFound>()(
  "PhotoNotFound",
  {
    message: Schema.String,
    subsystem: Schema.Literal("photo"),
    operation: Schema.Literals(["read", "preview"]),
    retryable: Schema.Literal(false),
  },
  { httpApiStatus: 404 },
) {}

/** The staged or active Foto projection could not be read or changed safely. */
export class PhotoProjectionUnavailable extends Schema.TaggedError<PhotoProjectionUnavailable>()(
  "PhotoProjectionUnavailable",
  {
    message: Schema.String,
    subsystem: Schema.Literal("photo-projection"),
    operation: Schema.Literals(["read", "stage", "activate"]),
    retryable: Schema.Boolean,
  },
  { httpApiStatus: 503 },
) {}
