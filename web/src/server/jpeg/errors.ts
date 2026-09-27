import { Schema } from "effect";

/** The byte source could not be opened or read. */
export class JpegSourceUnavailable extends Schema.TaggedError<JpegSourceUnavailable>()(
  "JpegSourceUnavailable",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

/** The input is not a structurally valid JPEG that can be safely rewritten. */
export class MalformedJpeg extends Schema.TaggedError<MalformedJpeg>()("MalformedJpeg", {
  offset: Schema.Number,
  reason: Schema.String,
  message: Schema.String,
}) {}

/** A valid-looking JPEG uses a structure whose preservation cannot be proved. */
export class UnsupportedJpegStructure extends Schema.TaggedError<UnsupportedJpegStructure>()(
  "UnsupportedJpegStructure",
  {
    reason: Schema.String,
    message: Schema.String,
  },
) {}

/** Bounded metadata or header limits were exceeded before output was produced. */
export class JpegLimitExceeded extends Schema.TaggedError<JpegLimitExceeded>()(
  "JpegLimitExceeded",
  {
    limit: Schema.Number,
    observed: Schema.Number,
    message: Schema.String,
  },
) {}

/** The replayable source changed after preflight and cannot safely produce output. */
export class JpegSourceChanged extends Schema.TaggedError<JpegSourceChanged>()(
  "JpegSourceChanged",
  { message: Schema.String },
) {}

/** The transformed bytes do not match the complete target or preservation proof. */
export class JpegVerificationFailed extends Schema.TaggedError<JpegVerificationFailed>()(
  "JpegVerificationFailed",
  {
    reason: Schema.String,
    message: Schema.String,
  },
) {}

/** Runtime schema for every expected codec failure exposed to workflow policy. */
export const JpegCodecError = Schema.Union([
  JpegSourceUnavailable,
  MalformedJpeg,
  UnsupportedJpegStructure,
  JpegLimitExceeded,
  JpegSourceChanged,
  JpegVerificationFailed,
]);

/** Every expected codec failure exposed to workflow policy. */
export type JpegCodecError = typeof JpegCodecError.Type;
