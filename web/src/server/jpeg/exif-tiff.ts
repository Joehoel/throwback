import { MalformedJpeg, UnsupportedJpegStructure } from "./errors.ts";

export const EXIF_PREFIX = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]);

export const TAG_IMAGE_DESCRIPTION = 0x01_0e;

export const TAG_ORIENTATION = 0x01_12;

export const TAG_EXIF_IFD = 0x87_69;

export const TAG_GPS_IFD = 0x88_25;

export const TAG_XP_TITLE = 0x9c_9b;

export const TAG_XP_SUBJECT = 0x9c_9f;

export const TAG_INTEROP_IFD = 0xa0_05;

export const TAG_THUMBNAIL_OFFSET = 0x02_01;

export const TAG_THUMBNAIL_LENGTH = 0x02_02;

const TYPE_SIZES = new Map([
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 4],
  [5, 8],
  [7, 1],
  [9, 4],
  [10, 8],
  [11, 4],
  [12, 8],
]);

export interface TiffEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly raw: Uint8Array;
  readonly value: Uint8Array;
}

export interface TiffIfd {
  readonly name: string;
  readonly offset: number;
  readonly entries: readonly TiffEntry[];
  readonly nextOffset: number;
}

export interface TiffDocument {
  readonly payload: Uint8Array;
  readonly tiff: Uint8Array;
  readonly view: DataView;
  readonly littleEndian: boolean;
  readonly ifd0: TiffIfd;
  readonly exif: TiffIfd | null;
  readonly gps: TiffIfd | null;
  readonly interop: TiffIfd | null;
  readonly ifd1: TiffIfd | null;
}

export function unsupportedExif(reason: string): UnsupportedJpegStructure {
  return new UnsupportedJpegStructure({
    reason,
    message: `Unsupported JPEG structure: ${reason}.`,
  });
}

export function malformedExif(reason: string, offset = 0): MalformedJpeg {
  return new MalformedJpeg({
    offset,
    reason,
    message: `Malformed JPEG: ${reason} at byte ${offset}.`,
  });
}

export function ensureTiffSpan(
  bytes: Uint8Array,
  span: { readonly offset: number; readonly length: number; readonly label: string },
): void {
  const { label, length, offset } = span;

  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.length
  ) {
    throw malformedExif(`${label} points outside its EXIF payload`, offset);
  }
}

function parseIfd(input: {
  readonly tiff: Uint8Array;
  readonly view: DataView;
  readonly littleEndian: boolean;
  readonly offset: number;
  readonly name: string;
  readonly visited: Set<number>;
}): TiffIfd {
  const { littleEndian, name, offset, tiff, view, visited } = input;

  if (visited.has(offset)) {
    throw unsupportedExif(`cyclic EXIF IFD at offset ${offset}`);
  }

  visited.add(offset);
  ensureTiffSpan(tiff, { offset, length: 2, label: `${name} entry count` });
  const count = view.getUint16(offset, littleEndian);

  if (count > 4096) {
    throw unsupportedExif(`${name} contains ${count} entries`);
  }

  const ifdLength = 2 + count * 12 + 4;
  ensureTiffSpan(tiff, { offset, length: ifdLength, label: name });
  const entries: TiffEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    const typeSize = TYPE_SIZES.get(type);

    if (typeSize === undefined) {
      throw unsupportedExif(`${name} tag ${tag} uses unknown TIFF type ${type}`);
    }

    const valueLength = valueCount * typeSize;

    if (!Number.isSafeInteger(valueLength)) {
      throw malformedExif(`${name} tag ${tag} has an invalid value length`);
    }

    const valueOffset =
      valueLength <= 4 ? entryOffset + 8 : view.getUint32(entryOffset + 8, littleEndian);

    ensureTiffSpan(tiff, {
      offset: valueOffset,
      length: valueLength,
      label: `${name} tag ${tag}`,
    });

    entries.push({
      tag,
      type,
      count: valueCount,
      raw: tiff.slice(entryOffset, entryOffset + 12),
      value: tiff.slice(valueOffset, valueOffset + valueLength),
    });
  }

  return {
    name,
    offset,
    entries,
    nextOffset: view.getUint32(offset + 2 + count * 12, littleEndian),
  };
}

export function uniqueEntry(ifd: TiffIfd, tag: number): TiffEntry | null {
  const entries = ifd.entries.filter((entry) => entry.tag === tag);

  if (entries.length > 1) {
    throw unsupportedExif(`${ifd.name} contains duplicate tag ${tag}`);
  }

  return entries[0] ?? null;
}

function pointer(entry: TiffEntry | null, littleEndian: boolean): number {
  if (entry === null) {
    return 0;
  }

  if (entry.type !== 4 || entry.count !== 1) {
    throw unsupportedExif(`IFD pointer tag ${entry.tag} has an unsafe representation`);
  }

  return new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength).getUint32(
    0,
    littleEndian,
  );
}

export function parseTiffDocument(payload: Uint8Array): TiffDocument {
  if (!EXIF_PREFIX.every((byte, index) => payload[index] === byte)) {
    throw malformedExif("APP1 segment does not contain EXIF");
  }

  const tiff = payload.subarray(EXIF_PREFIX.length);
  ensureTiffSpan(tiff, { offset: 0, length: 8, label: "TIFF header" });
  const byteOrder = new TextDecoder("ascii").decode(tiff.subarray(0, 2));

  if (byteOrder !== "II" && byteOrder !== "MM") {
    throw malformedExif("EXIF byte order is invalid", 6);
  }

  const littleEndian = byteOrder === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);

  if (view.getUint16(2, littleEndian) !== 42) {
    throw malformedExif("EXIF TIFF magic is invalid", 8);
  }

  const ifd0Offset = view.getUint32(4, littleEndian);

  if (ifd0Offset === 0) {
    throw malformedExif("EXIF IFD0 pointer is empty", 10);
  }

  const visited = new Set<number>();
  const shared = { tiff, view, littleEndian, visited };
  const ifd0 = parseIfd({ ...shared, offset: ifd0Offset, name: "IFD0" });
  const exifOffset = pointer(uniqueEntry(ifd0, TAG_EXIF_IFD), littleEndian);
  const gpsOffset = pointer(uniqueEntry(ifd0, TAG_GPS_IFD), littleEndian);

  const exif =
    exifOffset === 0 ? null : parseIfd({ ...shared, offset: exifOffset, name: "ExifIFD" });

  const gps = gpsOffset === 0 ? null : parseIfd({ ...shared, offset: gpsOffset, name: "GPSIFD" });

  if (gps !== null && gps.nextOffset !== 0) {
    throw unsupportedExif("GPS IFD chaining cannot be preserved safely");
  }

  const interopOffset =
    exif === null ? 0 : pointer(uniqueEntry(exif, TAG_INTEROP_IFD), littleEndian);

  const interop =
    interopOffset === 0 ? null : parseIfd({ ...shared, offset: interopOffset, name: "InteropIFD" });

  const ifd1 =
    ifd0.nextOffset === 0 ? null : parseIfd({ ...shared, offset: ifd0.nextOffset, name: "IFD1" });

  if (ifd1 !== null && ifd1.nextOffset !== 0) {
    throw unsupportedExif("multiple thumbnail IFDs cannot be preserved safely");
  }

  return { payload, tiff, view, littleEndian, ifd0, exif, gps, interop, ifd1 };
}

export function readShortOrLong(
  entry: TiffEntry | null,
  littleEndian: boolean,
  label: string,
): number | null {
  if (entry === null) {
    return null;
  }

  const view = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);

  if (entry.type === 3 && entry.count === 1) {
    return view.getUint16(0, littleEndian);
  }

  if (entry.type === 4 && entry.count === 1) {
    return view.getUint32(0, littleEndian);
  }

  throw unsupportedExif(`${label} has an unsafe representation`);
}

export function emptyTiffDocument(): TiffDocument {
  const payload = new Uint8Array(EXIF_PREFIX.length + 8 + 6);
  payload.set(EXIF_PREFIX);
  payload.subarray(EXIF_PREFIX.length).set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);

  return parseTiffDocument(payload);
}
