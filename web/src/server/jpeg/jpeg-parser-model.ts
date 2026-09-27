import { JpegLimitExceeded, MalformedJpeg } from "./errors.ts";
import type { JpegSegment } from "./jpeg-segment.ts";

export const INITIAL_HEADER_CAPACITY = 64 * 1024;

export const MAX_HEADER_SEGMENTS = 4096;

export type ParserMode =
  | "start"
  | "marker-prefix"
  | "marker-code"
  | "length"
  | "payload"
  | "scan"
  | "done";

/** Bounded parse result used by metadata transforms and preservation verification. */
export interface ParsedJpeg {
  readonly header: Uint8Array;
  readonly headerByteLength: number;
  readonly byteLength: number;
  readonly fingerprint: string;
  readonly tailByteLength: number;
  readonly tailFingerprint: string;
  readonly scanCount: number;
  readonly segments: readonly JpegSegment[];
  readonly preservedSegmentFingerprints: readonly string[];
}

export function malformedJpeg(offset: number, reason: string): MalformedJpeg {
  return new MalformedJpeg({
    offset,
    reason,
    message: `Malformed JPEG: ${reason} at byte ${offset}.`,
  });
}

export function nextHeaderByteCount(observed: number, limit: number): number {
  const next = observed + 1;

  if (next > limit) {
    throw new JpegLimitExceeded({
      limit,
      observed: next,
      message: `JPEG header exceeds the ${limit}-byte safety limit.`,
    });
  }

  return next;
}
