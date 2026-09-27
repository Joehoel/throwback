import { JpegVerificationFailed } from "./errors.ts";
import { exifPreservedFingerprint, parseExif } from "./exif.ts";
import { fingerprint } from "./fingerprint.ts";
import { isExifPayload, isExtendedXmpPayload, isStandardXmpPayload } from "./jpeg-parser.ts";
import type { JpegSegment, ParsedJpeg } from "./jpeg-parser.ts";
import type { JpegPreservationManifest, MetadataLocation, PhotoMetadataTarget } from "./model.ts";
import { parseXmp, validateExtendedXmp } from "./xmp.ts";

const EMPTY_FINGERPRINT = fingerprint(new Uint8Array());

/** Full codec inspection result without embedded metadata values in its manifest. */
export interface JpegInspection {
  readonly metadata: {
    readonly description: string | null;
    readonly location: MetadataLocation | null;
    readonly orientation: PhotoMetadataTarget["orientation"];
  };
  readonly manifest: JpegPreservationManifest;
  readonly contentFingerprint: string;
}

/** Managed APP1 segments selected from the bounded pre-scan header. */
export interface MetadataSegments {
  readonly exif: JpegSegment | null;
  readonly xmp: JpegSegment | null;
  readonly extendedXmp: readonly JpegSegment[];
}

/** Metadata payloads produced during transform preflight. */
export interface TransformedMetadata {
  readonly exifPayload: Uint8Array | null;
  readonly xmpPayload: Uint8Array | null;
}

function oneManagedSegment(segments: readonly JpegSegment[], label: string): JpegSegment | null {
  if (segments.length > 1) {
    throw new JpegVerificationFailed({
      reason: `multiple ${label} segments`,
      message: `JPEG verification failed: multiple ${label} APP1 segments are ambiguous.`,
    });
  }

  return segments[0] ?? null;
}

export function metadataSegments(parsed: ParsedJpeg): MetadataSegments {
  const exif = parsed.segments.filter(
    (segment) => segment.marker === 0xe1 && isExifPayload(segment.payload),
  );

  const xmp = parsed.segments.filter(
    (segment) => segment.marker === 0xe1 && isStandardXmpPayload(segment.payload),
  );

  const extendedXmp = parsed.segments.filter(
    (segment) => segment.marker === 0xe1 && isExtendedXmpPayload(segment.payload),
  );

  return {
    exif: oneManagedSegment(exif, "EXIF"),
    xmp: oneManagedSegment(xmp, "standard XMP"),
    extendedXmp,
  };
}

export function inspectParsedJpeg(parsed: ParsedJpeg, maxHeaderBytes: number): JpegInspection {
  const segments = metadataSegments(parsed);
  const exif = segments.exif === null ? null : parseExif(segments.exif.payload);
  const xmp = segments.xmp === null ? null : parseXmp(segments.xmp.payload);
  validateExtendedXmp(
    segments.extendedXmp.map((segment) => segment.payload),
    xmp?.packet ?? null,
    maxHeaderBytes,
  );

  return {
    metadata: {
      description: xmp?.description ?? null,
      location: exif?.location ?? null,
      orientation: exif?.orientation ?? 1,
    },
    manifest: {
      byteLength: parsed.byteLength,
      scanCount: parsed.scanCount,
      tailByteLength: parsed.tailByteLength,
      tailFingerprint: parsed.tailFingerprint,
      preservedSegmentFingerprints: parsed.preservedSegmentFingerprints,
      exifPreservedByteLength: exif?.payload.length ?? 0,
      exifPreservedFingerprint: exif?.preservedFingerprint ?? EMPTY_FINGERPRINT,
      exifUnmanagedFingerprint: exif?.unmanagedFingerprint ?? EMPTY_FINGERPRINT,
      xmpUnmanagedFingerprint: xmp?.unmanagedFingerprint ?? EMPTY_FINGERPRINT,
    },
    contentFingerprint: parsed.fingerprint,
  };
}

function locationMatches(
  actual: MetadataLocation | null,
  target: MetadataLocation | null,
): boolean {
  if (actual === null || target === null) {
    return actual === target;
  }

  return (
    Math.abs(actual.latitude - target.latitude) < 1e-7 &&
    Math.abs(actual.longitude - target.longitude) < 1e-7
  );
}

function verifyTarget(inspection: JpegInspection, target: PhotoMetadataTarget): void {
  if (
    inspection.metadata.description !== target.description ||
    !locationMatches(inspection.metadata.location, target.location) ||
    inspection.metadata.orientation !== target.orientation
  ) {
    throw new JpegVerificationFailed({
      reason: "managed metadata target mismatch",
      message: "JPEG verification failed: managed metadata does not match the complete target.",
    });
  }
}

function absentDescriptionMirrorsMatch(
  exif: ReturnType<typeof parseExif> | null,
  xmp: ReturnType<typeof parseXmp> | null,
): boolean {
  const xmpIsClear = (xmp?.description ?? null) === null && (xmp?.title ?? null) === null;

  const exifIsClear =
    (exif?.xpTitle ?? null) === null &&
    (exif?.xpSubject ?? null) === null &&
    !(exif?.hasImageDescription ?? false);

  return xmpIsClear && exifIsClear;
}

function descriptionMirrorsMatch(
  exif: ReturnType<typeof parseExif> | null,
  xmp: ReturnType<typeof parseXmp> | null,
  description: string | null,
): boolean {
  if (description === null) {
    return absentDescriptionMirrorsMatch(exif, xmp);
  }

  if (exif === null || xmp === null) {
    return false;
  }

  return (
    xmp.description === description &&
    xmp.title === description &&
    exif.xpTitle === description &&
    exif.xpSubject === description &&
    !exif.hasImageDescription
  );
}

function verifyDescriptionMirrors(input: {
  readonly exif: ReturnType<typeof parseExif> | null;
  readonly xmp: ReturnType<typeof parseXmp> | null;
  readonly target: PhotoMetadataTarget;
  readonly phase: "preflight" | "output";
}): void {
  if (descriptionMirrorsMatch(input.exif, input.xmp, input.target.description)) {
    return;
  }

  throw new JpegVerificationFailed({
    reason: `${input.phase} Description mirror mismatch`,
    message: "JPEG verification failed: Description mirrors do not match the complete target.",
  });
}

function comparePreservation(
  source: JpegPreservationManifest,
  output: JpegPreservationManifest,
): void {
  const sameSegments =
    source.preservedSegmentFingerprints.length === output.preservedSegmentFingerprints.length &&
    source.preservedSegmentFingerprints.every(
      (digest, index) => digest === output.preservedSegmentFingerprints[index],
    );

  const unchanged =
    source.scanCount === output.scanCount &&
    source.tailByteLength === output.tailByteLength &&
    source.tailFingerprint === output.tailFingerprint &&
    sameSegments &&
    source.exifUnmanagedFingerprint === output.exifUnmanagedFingerprint &&
    source.xmpUnmanagedFingerprint === output.xmpUnmanagedFingerprint;

  if (!unchanged) {
    throw new JpegVerificationFailed({
      reason: "preservation manifest mismatch",
      message: "JPEG verification failed: unmanaged JPEG bytes or metadata changed.",
    });
  }
}

function verifyExifPrefix(
  payload: Uint8Array | null,
  sourceManifest: JpegPreservationManifest,
): void {
  const sourceLength = sourceManifest.exifPreservedByteLength;

  const hasPrefix = payload !== null && payload.length >= sourceLength;

  const actualFingerprint = hasPrefix
    ? exifPreservedFingerprint(payload, sourceLength)
    : EMPTY_FINGERPRINT;

  if (actualFingerprint !== sourceManifest.exifPreservedFingerprint) {
    throw new JpegVerificationFailed({
      reason: "EXIF source prefix mismatch",
      message: "JPEG verification failed: original EXIF bytes were not preserved exactly.",
    });
  }
}

export function verifyTransformedMetadata(
  source: JpegInspection,
  transformed: TransformedMetadata,
  target: PhotoMetadataTarget,
): void {
  const exif = transformed.exifPayload === null ? null : parseExif(transformed.exifPayload);
  const xmp = transformed.xmpPayload === null ? null : parseXmp(transformed.xmpPayload);
  const actualLocation = exif?.location ?? null;

  const targetMatches =
    (xmp?.description ?? null) === target.description &&
    (exif?.orientation ?? 1) === target.orientation &&
    locationMatches(actualLocation, target.location);

  if (!targetMatches) {
    throw new JpegVerificationFailed({
      reason: "preflight target mismatch",
      message: "JPEG verification failed: transformed header does not contain the complete target.",
    });
  }

  verifyDescriptionMirrors({ exif, xmp, target, phase: "preflight" });
  verifyExifPrefix(transformed.exifPayload, source.manifest);

  const unmanagedMatches =
    (exif?.unmanagedFingerprint ?? EMPTY_FINGERPRINT) ===
      source.manifest.exifUnmanagedFingerprint &&
    (xmp?.unmanagedFingerprint ?? EMPTY_FINGERPRINT) === source.manifest.xmpUnmanagedFingerprint;

  if (!unmanagedMatches) {
    throw new JpegVerificationFailed({
      reason: "preflight unmanaged metadata mismatch",
      message: "JPEG verification failed: transformed unmanaged metadata changed.",
    });
  }
}

export function verifyParsedJpeg(input: {
  readonly parsed: ParsedJpeg;
  readonly target: PhotoMetadataTarget;
  readonly sourceManifest: JpegPreservationManifest;
  readonly maxHeaderBytes: number;
}): JpegInspection {
  const inspection = inspectParsedJpeg(input.parsed, input.maxHeaderBytes);
  const segments = metadataSegments(input.parsed);
  const exif = segments.exif === null ? null : parseExif(segments.exif.payload);
  const xmp = segments.xmp === null ? null : parseXmp(segments.xmp.payload);

  verifyTarget(inspection, input.target);
  verifyDescriptionMirrors({ exif, xmp, target: input.target, phase: "output" });
  verifyExifPrefix(segments.exif?.payload ?? null, input.sourceManifest);
  comparePreservation(input.sourceManifest, inspection.manifest);

  return inspection;
}
