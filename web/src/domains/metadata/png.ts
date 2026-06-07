import { binaryToUtf8, crc32, readU32, utf8ToBinary, writeU32 } from "./binary.ts";
import { buildXmpPacket, descriptionFromXml } from "./xmp.ts";

/**
 * PNG XMP read/write. PNG carries XMP in an `iTXt` chunk keyed
 * "XML:com.adobe.xmp" (uncompressed, UTF-8) — the PNG counterpart to JPEG's APP1
 * (ADR-0019). A PNG is an 8-byte signature followed by chunks
 * `<len:4 BE><type:4><data><crc:4 BE>`; we walk them, swap the XMP chunk, and
 * recompute its CRC. Pure: binary string in/out; the packet builder + description
 * extractor are shared with `xmp.ts`.
 */

const NUL = String.fromCodePoint(0);
const XMP_KEYWORD = "XML:com.adobe.xmp";
const SIGNATURE_LENGTH = 8;
const IEND = "IEND";
const ITXT = "iTXt";

interface Chunk {
  readonly start: number;
  readonly end: number;
  readonly type: string;
  readonly dataStart: number;
  readonly length: number;
}

/** Walk a PNG's chunks (signature is the first 8 bytes; each chunk is len+type+data+crc). */
function listChunks(png: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let pos = SIGNATURE_LENGTH;
  while (pos + 8 <= png.length) {
    const length = readU32(png, pos, false);
    const type = png.slice(pos + 4, pos + 8);
    chunks.push({ start: pos, end: pos + 12 + length, type, dataStart: pos + 8, length });
    if (type === IEND) {
      break;
    }
    pos += 12 + length;
  }
  return chunks;
}

const isXmpChunk = (png: string, chunk: Chunk): boolean =>
  chunk.type === ITXT && png.startsWith(XMP_KEYWORD, chunk.dataStart);

/** The Beschrijving from a PNG's XMP `iTXt` chunk; null if absent. */
export function readPngDescription(png: string): string | null {
  const chunk = listChunks(png).find((candidate) => isXmpChunk(png, candidate));
  if (chunk === undefined) {
    return null;
  }
  const data = png.slice(chunk.dataStart, chunk.dataStart + chunk.length);
  // iTXt data: keyword \0 | compFlag | compMethod | langTag \0 | translatedKeyword \0 | text
  const keywordEnd = data.indexOf(NUL);
  const langEnd = data.indexOf(NUL, keywordEnd + 3); // skip the NUL + compFlag + compMethod
  const textStart = data.indexOf(NUL, langEnd + 1) + 1; // after the translated-keyword NUL
  if (keywordEnd === -1 || langEnd === -1 || textStart === 0) {
    return null;
  }
  return descriptionFromXml(binaryToUtf8(data.slice(textStart)));
}

/** Assemble a PNG chunk (`len + type + data + crc32(type+data)`). */
const makeChunk = (type: string, data: string): string =>
  writeU32(data.length, false) + type + data + writeU32(crc32(type + data), false);

/** Drop any existing XMP `iTXt` chunk so we never end up with two. */
function removeXmpChunk(png: string): string {
  const chunk = listChunks(png).find((candidate) => isXmpChunk(png, candidate));
  return chunk === undefined ? png : png.slice(0, chunk.start) + png.slice(chunk.end);
}

/**
 * Write `Beschrijving` as XMP `dc:description` (+ `dc:title`) into a PNG's `iTXt`
 * chunk, inserted right after IHDR. Replaces any existing XMP chunk; all other
 * chunks (pixels/ICC) are preserved. Returns the new PNG binary string.
 */
export function writePngDescription(png: string, description: string): string {
  const text = utf8ToBinary(buildXmpPacket(description));
  // keyword \0 | compFlag 0 | compMethod 0 | langTag(empty) \0 | translatedKeyword(empty) \0 | text
  const data = `${XMP_KEYWORD}${NUL}${NUL}${NUL}${NUL}${NUL}${text}`;
  const without = removeXmpChunk(png);
  const ihdr = listChunks(without).at(0);
  const insertAt = ihdr === undefined ? SIGNATURE_LENGTH : ihdr.end;
  return without.slice(0, insertAt) + makeChunk(ITXT, data) + without.slice(insertAt);
}
