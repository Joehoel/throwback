import { writeU32 } from "../binary.ts";

/**
 * Test-only fixture: a structurally-valid minimal PNG (signature + IHDR + IEND).
 * The XMP read/write path only walks chunks, so a placeholder CRC on the static
 * chunks is fine — the writer computes a real CRC for the iTXt chunk it adds.
 */

const SIGNATURE = String.fromCodePoint(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const chunk = (type: string, data: string): string =>
  writeU32(data.length, false) + type + data + writeU32(0, false);

/** A 1×1 8-bit RGB PNG with no metadata. */
export function pngBinary(): string {
  // IHDR: width=1, height=1, bitDepth=8, colorType=2 (RGB), compression/filter/interlace=0.
  const ihdr = String.fromCodePoint(0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0);
  return SIGNATURE + chunk("IHDR", ihdr) + chunk("IEND", "");
}
