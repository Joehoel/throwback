import { readFile } from "node:fs/promises";

const richJpegUrl = new URL("../jpeg/fixtures/little-endian-rich.jpg", import.meta.url);

/** Load the canonical rich JPEG corpus fixture used by the vertical tracer. */
export function loadPhotoTracerJpeg(): Promise<Uint8Array> {
  return readFile(richJpegUrl);
}
