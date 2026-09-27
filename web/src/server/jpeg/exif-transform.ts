import type { MetadataLocation, PhotoMetadataTarget } from "./model.ts";
import { parseExif } from "./exif-read.ts";
import {
  EXIF_PREFIX,
  emptyTiffDocument,
  parseTiffDocument,
  TAG_GPS_IFD,
  TAG_IMAGE_DESCRIPTION,
  TAG_ORIENTATION,
  TAG_XP_SUBJECT,
  TAG_XP_TITLE,
  uniqueEntry,
  unsupportedExif,
} from "./exif-tiff.ts";
import type { TiffDocument } from "./exif-tiff.ts";
import { TiffAppender } from "./tiff-appender.ts";

function locationEquals(left: MetadataLocation | null, right: MetadataLocation | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    Math.abs(left.latitude - right.latitude) < 1e-7 &&
    Math.abs(left.longitude - right.longitude) < 1e-7
  );
}

function utf16CodeUnits(text: string): readonly number[] {
  const codeUnits: number[] = [];

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint <= 0xff_ff) {
      codeUnits.push(codePoint);
    } else {
      const adjusted = codePoint - 0x1_00_00;

      codeUnits.push(0xd8_00 + Math.floor(adjusted / 0x4_00), 0xdc_00 + (adjusted % 0x4_00));
    }
  }

  return codeUnits;
}

function encodeXp(text: string): Uint8Array {
  const codeUnits = utf16CodeUnits(text);
  const bytes = new Uint8Array((codeUnits.length + 1) * 2);
  const view = new DataView(bytes.buffer);

  for (const [index, codeUnit] of codeUnits.entries()) {
    view.setUint16(index * 2, codeUnit, true);
  }

  return bytes;
}

function uint32Bytes(value: number, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, littleEndian);

  return bytes;
}

function entryBytes(input: {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly value: Uint8Array;
  readonly littleEndian: boolean;
}): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, input.tag, input.littleEndian);
  view.setUint16(2, input.type, input.littleEndian);
  view.setUint32(4, input.count, input.littleEndian);
  bytes.set(input.value.subarray(0, 4), 8);

  return bytes;
}

function ifdBytes(
  entries: readonly Uint8Array[],
  nextOffset: number,
  littleEndian: boolean,
): Uint8Array {
  if (entries.length > 0xff_ff) {
    throw unsupportedExif("rewritten IFD contains too many entries");
  }

  const bytes = new Uint8Array(2 + entries.length * 12 + 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, entries.length, littleEndian);

  for (const [index, entry] of entries.entries()) {
    bytes.set(entry, 2 + index * 12);
  }

  view.setUint32(2 + entries.length * 12, nextOffset, littleEndian);

  return bytes;
}

function rationalBytes(location: number, littleEndian: boolean): Uint8Array {
  const absolute = Math.abs(location);
  const degrees = Math.floor(absolute);
  const minutesValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesValue);
  const secondsNumerator = Math.round((minutesValue - minutes) * 60 * 1_000_000);
  const values = [degrees, 1, minutes, 1, secondsNumerator, 1_000_000];
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);

  for (const [index, value] of values.entries()) {
    view.setUint32(index * 4, value, littleEndian);
  }

  return bytes;
}

function sortEntries(entries: Uint8Array[], littleEndian: boolean): void {
  entries.sort((left, right) => {
    const leftTag = new DataView(left.buffer, left.byteOffset, left.byteLength).getUint16(
      0,
      littleEndian,
    );

    const rightTag = new DataView(right.buffer, right.byteOffset, right.byteLength).getUint16(
      0,
      littleEndian,
    );

    return leftTag - rightTag;
  });
}

function descriptionEntries(
  description: string | null,
  document: TiffDocument,
  appender: TiffAppender,
): readonly Uint8Array[] {
  if (description === null) {
    return [];
  }

  const encoded = encodeXp(description);
  const titleOffset = appender.add(encoded);
  const subjectOffset = appender.add(encoded);
  const common = { type: 1, count: encoded.length, littleEndian: document.littleEndian };

  return [
    entryBytes({
      ...common,
      tag: TAG_XP_TITLE,
      value: uint32Bytes(titleOffset, document.littleEndian),
    }),
    entryBytes({
      ...common,
      tag: TAG_XP_SUBJECT,
      value: uint32Bytes(subjectOffset, document.littleEndian),
    }),
  ];
}

function gpsPointerEntry(input: {
  readonly document: TiffDocument;
  readonly target: MetadataLocation | null;
  readonly preserveExisting: boolean;
  readonly appender: TiffAppender;
}): Uint8Array | null {
  const { appender, document, preserveExisting, target } = input;

  if (preserveExisting) {
    return uniqueEntry(document.ifd0, TAG_GPS_IFD)?.raw ?? null;
  }

  const gpsEntries = (document.gps?.entries ?? [])
    .filter((entry) => entry.tag < 1 || entry.tag > 6)
    .map((entry) => entry.raw);

  if (target !== null) {
    const latitudeOffset = appender.add(rationalBytes(target.latitude, document.littleEndian), 4);
    const longitudeOffset = appender.add(rationalBytes(target.longitude, document.littleEndian), 4);

    gpsEntries.push(
      entryBytes({
        tag: 1,
        type: 2,
        count: 2,
        value: new Uint8Array([target.latitude < 0 ? 0x53 : 0x4e, 0]),
        littleEndian: document.littleEndian,
      }),
      entryBytes({
        tag: 2,
        type: 5,
        count: 3,
        value: uint32Bytes(latitudeOffset, document.littleEndian),
        littleEndian: document.littleEndian,
      }),
      entryBytes({
        tag: 3,
        type: 2,
        count: 2,
        value: new Uint8Array([target.longitude < 0 ? 0x57 : 0x45, 0]),
        littleEndian: document.littleEndian,
      }),
      entryBytes({
        tag: 4,
        type: 5,
        count: 3,
        value: uint32Bytes(longitudeOffset, document.littleEndian),
        littleEndian: document.littleEndian,
      }),
    );
  }

  if (gpsEntries.length === 0) {
    return null;
  }

  sortEntries(gpsEntries, document.littleEndian);
  const gpsOffset = appender.add(ifdBytes(gpsEntries, 0, document.littleEndian), 4);

  return entryBytes({
    tag: TAG_GPS_IFD,
    type: 4,
    count: 1,
    value: uint32Bytes(gpsOffset, document.littleEndian),
    littleEndian: document.littleEndian,
  });
}

function orientationEntry(
  target: PhotoMetadataTarget,
  hasOrientation: boolean,
  littleEndian: boolean,
): Uint8Array | null {
  if (target.orientation === 1 && !hasOrientation) {
    return null;
  }

  const value = new Uint8Array(4);
  new DataView(value.buffer).setUint16(0, target.orientation, littleEndian);

  return entryBytes({ tag: TAG_ORIENTATION, type: 3, count: 1, value, littleEndian });
}

/** Append a new reachable IFD without moving any original offset-sensitive EXIF bytes. */
export function transformExif(
  existingPayload: Uint8Array | null,
  target: PhotoMetadataTarget,
): Uint8Array | null {
  if (
    existingPayload === null &&
    target.description === null &&
    target.location === null &&
    target.orientation === 1
  ) {
    return null;
  }

  const document =
    existingPayload === null ? emptyTiffDocument() : parseTiffDocument(existingPayload);

  const parsed = parseExif(document.payload);

  const descriptionMatches =
    target.description === null
      ? parsed.xpTitle === null && parsed.xpSubject === null && !parsed.hasImageDescription
      : parsed.xpTitle === target.description &&
        parsed.xpSubject === target.description &&
        !parsed.hasImageDescription;

  const sameLocation =
    locationEquals(parsed.location, target.location) &&
    (target.location !== null || !parsed.hasManagedGps);

  if (
    existingPayload !== null &&
    descriptionMatches &&
    sameLocation &&
    parsed.orientation === target.orientation
  ) {
    return existingPayload;
  }

  const appender = new TiffAppender(document.tiff);

  const skipped = new Set([
    TAG_IMAGE_DESCRIPTION,
    TAG_ORIENTATION,
    TAG_GPS_IFD,
    TAG_XP_TITLE,
    TAG_XP_SUBJECT,
  ]);

  const replacementEntries = document.ifd0.entries
    .filter((entry) => !skipped.has(entry.tag))
    .map((entry) => entry.raw);

  const orientation = orientationEntry(target, parsed.hasOrientation, document.littleEndian);

  const gps = gpsPointerEntry({
    document,
    target: target.location,
    preserveExisting: sameLocation,
    appender,
  });

  if (orientation !== null) {
    replacementEntries.push(orientation);
  }

  replacementEntries.push(...descriptionEntries(target.description, document, appender));

  if (gps !== null) {
    replacementEntries.push(gps);
  }

  sortEntries(replacementEntries, document.littleEndian);

  const ifd0Offset = appender.add(
    ifdBytes(replacementEntries, document.ifd0.nextOffset, document.littleEndian),
    4,
  );

  const tiff = appender.finish();
  new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength).setUint32(
    4,
    ifd0Offset,
    document.littleEndian,
  );
  const payload = new Uint8Array(EXIF_PREFIX.length + tiff.length);
  payload.set(EXIF_PREFIX);
  payload.set(tiff, EXIF_PREFIX.length);

  if (payload.length > 65_533) {
    throw unsupportedExif("rewritten EXIF exceeds one APP1 segment");
  }

  return payload;
}
