import { byteAt, readU16 } from "./binary.ts";

/**
 * JPEG segment helpers shared by the EXIF reader and writer. A JPEG is SOI
 * (0xFFD8) followed by marker segments — each `0xFF <marker> <len:2 BE> <payload>`
 * — until SOS (image data). EXIF lives in the APP1 (0xFFE1) segment whose payload
 * starts with "Exif\0\0"; the TIFF block is everything after that 10-byte header.
 */

export const MARKER = 0xff; // every marker's lead byte
export const SOI = 0xd8; // start of image
export const EOI = 0xd9; // end of image
export const SOS = 0xda; // start of scan (image data; no headers after)
export const APP1 = 0xe1; // application segment 1 (EXIF / XMP)

// "Exif\0\0" built from code points (keeps NUL bytes out of the source).
export const EXIF_HEADER = `Exif${String.fromCodePoint(0, 0)}`;

/** The located APP1 Exif segment: its byte range plus the TIFF block + byte order. */
export interface ExifSegment {
  readonly start: number;
  readonly end: number;
  readonly tiff: string;
  readonly le: boolean;
}

/** Find the APP1 Exif segment in a JPEG binary string, or null. */
export function findExifSegment(jpeg: string): ExifSegment | null {
  if (byteAt(jpeg, 0) !== MARKER || byteAt(jpeg, 1) !== SOI) {
    return null; // not a JPEG (no SOI)
  }
  let pos = 2;
  while (pos + 4 <= jpeg.length) {
    if (byteAt(jpeg, pos) !== MARKER) {
      return null;
    }
    const marker = byteAt(jpeg, pos + 1);
    if (marker === SOS || marker === EOI) {
      return null; // past the headers, no EXIF
    }
    const length = readU16(jpeg, pos + 2, false); // JPEG segment lengths are always big-endian
    if (marker === APP1 && jpeg.startsWith(EXIF_HEADER, pos + 4)) {
      const tiff = jpeg.slice(pos + 10, pos + 2 + length);
      return { start: pos, end: pos + 2 + length, tiff, le: tiff.startsWith("II") };
    }
    pos += 2 + length;
  }
  return null;
}
