import { fingerprint } from "./fingerprint.ts";

const EXIF_PREFIX = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]);

const XMP_PREFIX = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0");

const EXTENDED_XMP_PREFIX = new TextEncoder().encode("http://ns.adobe.com/xmp/extension/\0");

/** One parsed JPEG marker segment retained before the first scan. */
export interface JpegSegment {
  readonly marker: number;
  readonly raw: Uint8Array;
  readonly payload: Uint8Array;
  readonly beforeFirstScan: true;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

/** Whether an APP1 payload is an EXIF container. */
export function isExifPayload(payload: Uint8Array): boolean {
  return startsWith(payload, EXIF_PREFIX);
}

/** Whether an APP1 payload is a standard XMP packet. */
export function isStandardXmpPayload(payload: Uint8Array): boolean {
  return startsWith(payload, XMP_PREFIX);
}

/** Whether an APP1 payload is an extended XMP chunk. */
export function isExtendedXmpPayload(payload: Uint8Array): boolean {
  return startsWith(payload, EXTENDED_XMP_PREFIX);
}

/** Whether a JPEG marker carries a two-byte segment length. */
export function markerHasLength(marker: number): boolean {
  return (
    marker !== 0x01 && marker !== 0xd8 && marker !== 0xd9 && !(marker >= 0xd0 && marker <= 0xd7)
  );
}

/** Whether a segment is one of the metadata containers managed by the codec. */
export function isManagedSegment(marker: number, payload: Uint8Array): boolean {
  return marker === 0xe1 && (isExifPayload(payload) || isStandardXmpPayload(payload));
}

/** Content fingerprint for one retained unmanaged marker segment. */
export function segmentFingerprint(segment: JpegSegment): string {
  return fingerprint(segment.raw);
}
