/**
 * Byte plumbing for the read path: a Blob's bytes as a latin1 binary string (one
 * char per byte), the shape `reader.ts` and `xmp.ts` index into. This is I/O
 * encoding, not a domain value transform, so it stays a plain function.
 */

/** Read a Blob into a binary string (one char per byte). */
export async function blobToBinaryString(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  const chunk = 32_768; // chunked to stay under the arg-count limit of fromCodePoint
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCodePoint(...bytes.subarray(i, i + chunk));
  }
  return out;
}
