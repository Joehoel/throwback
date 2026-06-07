/**
 * Byte plumbing for the read/write paths: bytes ⇄ a latin1 binary string (one char
 * per byte), the shape `reader.ts`/`xmp.ts` index into. This is I/O encoding, not a
 * domain value transform, so it stays plain functions.
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
