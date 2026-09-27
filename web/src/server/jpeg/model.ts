import { Schema } from "effect";
import type { Effect } from "effect";
import type { JpegCodecError, JpegSourceUnavailable } from "./errors.ts";

/** Semantic EXIF Orientation, including all mirrored and transposed states. */
export const Orientation = Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8]).annotate({
  identifier: "Orientation",
});

/** Semantic EXIF Orientation, including all mirrored and transposed states. */
export type Orientation = typeof Orientation.Type;

/** Latitude and longitude managed by the Curator; altitude is deliberately excluded. */
export const MetadataLocation = Schema.Struct({
  latitude: Schema.Finite.check(Schema.isBetween({ minimum: -90, maximum: 90 })),
  longitude: Schema.Finite.check(Schema.isBetween({ minimum: -180, maximum: 180 })),
}).annotate({ identifier: "MetadataLocation" });

/** Latitude and longitude managed by the Curator; altitude is deliberately excluded. */
export type MetadataLocation = typeof MetadataLocation.Type;

/**
 * Complete immutable metadata intent for one Foto.
 *
 * `null` explicitly removes Description or Location; it never means “leave unchanged”.
 */
export const PhotoMetadataTarget = Schema.Struct({
  description: Schema.NullOr(Schema.NonEmptyString),
  location: Schema.NullOr(MetadataLocation),
  orientation: Orientation,
}).annotate({ identifier: "PhotoMetadataTarget" });

/** Complete immutable metadata intent for one Foto. */
export type PhotoMetadataTarget = typeof PhotoMetadataTarget.Type;

/** Metadata reread from a JPEG, with a missing Orientation normalized to upright. */
export interface PhotoMetadata {
  readonly description: string | null;
  readonly location: MetadataLocation | null;
  readonly orientation: Orientation;
}

/** Content-free evidence used to compare source and transformed JPEG preservation. */
export interface JpegPreservationManifest {
  readonly byteLength: number;
  readonly scanCount: number;
  readonly tailByteLength: number;
  readonly tailFingerprint: string;
  readonly preservedSegmentFingerprints: readonly string[];
  readonly exifPreservedByteLength: number;
  readonly exifPreservedFingerprint: string;
  readonly exifUnmanagedFingerprint: string;
  readonly xmpUnmanagedFingerprint: string;
}

/** Replayable byte source required for safe preflight before output is exposed. */
export interface ReplayableJpeg {
  /** Opens the same immutable JPEG bytes on every call. */
  readonly open: () => Effect.Effect<ReadableStream<Uint8Array>, JpegSourceUnavailable>;
}

/** Prepared output whose structure and managed target passed preflight verification. */
export interface PreparedJpegTransform {
  readonly byteLength: number;
  readonly sourceManifest: JpegPreservationManifest;
  /** Opens a fresh bounded stream; consuming it also detects source changes between passes. */
  readonly open: () => Effect.Effect<ReadableStream<Uint8Array>, JpegCodecError>;
}
