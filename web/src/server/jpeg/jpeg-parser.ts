import { JpegParser } from "./jpeg-parser-state.ts";

/** Default maximum bytes retained before the first entropy-coded scan. */
export const DEFAULT_MAX_JPEG_HEADER_BYTES = 8 * 1024 * 1024;

export { isExifPayload, isExtendedXmpPayload, isStandardXmpPayload } from "./jpeg-segment.ts";

export type { JpegSegment } from "./jpeg-segment.ts";

export type { ParsedJpeg } from "./jpeg-parser-model.ts";

async function readToEnd(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  parser: JpegParser,
): Promise<ReturnType<JpegParser["finish"]>> {
  const result = await reader.read();

  if (result.done) {
    return parser.finish();
  }

  parser.feed(result.value);

  return readToEnd(reader, parser);
}

/** Parse a Web byte stream without retaining entropy-coded scan data. */
export async function parseJpegStream(
  stream: ReadableStream<Uint8Array>,
  maxHeaderBytes = DEFAULT_MAX_JPEG_HEADER_BYTES,
): Promise<ReturnType<JpegParser["finish"]>> {
  const parser = new JpegParser(maxHeaderBytes);
  const reader = stream.getReader();

  try {
    return await readToEnd(reader, parser);
  } catch (error) {
    await reader.cancel(error).catch(() => false);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
