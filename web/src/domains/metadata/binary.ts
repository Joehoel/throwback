/**
 * Byte plumbing for the read/write paths: bytes ⇄ a latin1 binary string (one char
 * per byte), plus endian-aware integer read/write. This is I/O encoding, not a
 * domain value transform, so it stays plain functions. `reader.ts`/`xmp.ts`/`exif.ts`
 * index into these.
 */

const CHUNK = 32_768; // keep fromCodePoint under its argument-count limit

/** Bytes → binary string (one char per byte). */
export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCodePoint(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Read a Blob into a binary string (one char per byte). */
export async function blobToBinaryString(blob: Blob): Promise<string> {
  return bytesToBinary(new Uint8Array(await blob.arrayBuffer()));
}

/** UTF-8 encode text into a binary string (multi-byte chars become their byte run). */
export function utf8ToBinary(text: string): string {
  return bytesToBinary(new TextEncoder().encode(text));
}

/** One byte of a latin1 binary string; out-of-range → 0 (no throw). */
export const byteAt = (s: string, i: number): number => s.codePointAt(i) ?? 0;

// Multi-byte ints use arithmetic (not bitwise) so they stay unsigned.

/** Read an unsigned 16-bit int (`le` = little-endian). */
export const readU16 = (s: string, i: number, le: boolean): number => {
  const a = byteAt(s, i);
  const b = byteAt(s, i + 1);
  return le ? a + b * 256 : a * 256 + b;
};

/** Read an unsigned 32-bit int (`le` = little-endian). */
export const readU32 = (s: string, i: number, le: boolean): number => {
  const a = byteAt(s, i);
  const b = byteAt(s, i + 1);
  const c = byteAt(s, i + 2);
  const d = byteAt(s, i + 3);
  return le ? a + b * 256 + c * 65_536 + d * 16_777_216 : d + c * 256 + b * 65_536 + a * 16_777_216;
};

/** Write an unsigned 16-bit int to a 2-char binary string. */
export const writeU16 = (value: number, le: boolean): string => {
  const lo = value % 256;
  const hi = Math.trunc(value / 256) % 256;
  return le ? String.fromCodePoint(lo, hi) : String.fromCodePoint(hi, lo);
};

/** Write an unsigned 32-bit int to a 4-char binary string. */
export const writeU32 = (value: number, le: boolean): string => {
  const b0 = value % 256;
  const b1 = Math.trunc(value / 256) % 256;
  const b2 = Math.trunc(value / 65_536) % 256;
  const b3 = Math.trunc(value / 16_777_216) % 256;
  return le ? String.fromCodePoint(b0, b1, b2, b3) : String.fromCodePoint(b3, b2, b1, b0);
};
