import type { MetadataLocation, Orientation } from "./model.ts";
import { ByteFingerprint, fingerprint } from "./fingerprint.ts";
import {
  ensureTiffSpan,
  malformedExif,
  parseTiffDocument,
  readShortOrLong,
  TAG_IMAGE_DESCRIPTION,
  TAG_GPS_IFD,
  TAG_ORIENTATION,
  TAG_THUMBNAIL_LENGTH,
  TAG_THUMBNAIL_OFFSET,
  TAG_XP_SUBJECT,
  TAG_XP_TITLE,
  uniqueEntry,
  unsupportedExif,
} from "./exif-tiff.ts";
import type { TiffDocument, TiffEntry, TiffIfd } from "./exif-tiff.ts";

/** Parsed EXIF fields and content-free preservation evidence. */
export interface ParsedExif {
  readonly orientation: Orientation;
  readonly hasOrientation: boolean;
  readonly location: MetadataLocation | null;
  readonly hasManagedGps: boolean;
  readonly xpTitle: string | null;
  readonly xpSubject: string | null;
  readonly hasImageDescription: boolean;
  readonly unmanagedFingerprint: string;
  readonly preservedFingerprint: string;
  readonly payload: Uint8Array;
}

/** Fingerprint the original EXIF prefix while ignoring the rewritten IFD0 pointer. */
export function exifPreservedFingerprint(payload: Uint8Array, byteLength: number): string {
  const prefix = payload.slice(0, byteLength);

  if (prefix.length >= 14) {
    prefix.fill(0, 10, 14);
  }

  return fingerprint(prefix);
}

function readShort(entry: TiffEntry | null, littleEndian: boolean, label: string): number | null {
  if (entry === null) {
    return null;
  }

  if (entry.type !== 3 || entry.count !== 1) {
    throw unsupportedExif(`${label} has an unsafe representation`);
  }

  return new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength).getUint16(
    0,
    littleEndian,
  );
}

function readXp(entry: TiffEntry | null): string | null {
  if (entry === null) {
    return null;
  }

  if (entry.type !== 1 || entry.count < 2 || entry.value.length % 2 !== 0) {
    throw unsupportedExif(`XP tag ${entry.tag} has an unsafe representation`);
  }

  const view = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);
  const codeUnits: number[] = [];

  for (let offset = 0; offset < entry.value.length; offset += 2) {
    const codeUnit = view.getUint16(offset, true);

    if (codeUnit === 0) {
      break;
    }

    codeUnits.push(codeUnit);
  }

  return String.fromCodePoint(...codeUnits);
}

function readAscii(entry: TiffEntry | null, label: string): string | null {
  if (entry === null) {
    return null;
  }

  if (entry.type !== 2 || entry.count < 2) {
    throw unsupportedExif(`${label} has an unsafe representation`);
  }

  return new TextDecoder("ascii").decode(entry.value).replace(/\0.*$/su, "");
}

function readRationals(
  entry: TiffEntry | null,
  littleEndian: boolean,
  label: string,
): readonly number[] | null {
  if (entry === null) {
    return null;
  }

  if (entry.type !== 5 || entry.count !== 3) {
    throw unsupportedExif(`${label} has an unsafe representation`);
  }

  const view = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);
  const values: number[] = [];

  for (let index = 0; index < 3; index += 1) {
    const numerator = view.getUint32(index * 8, littleEndian);
    const denominator = view.getUint32(index * 8 + 4, littleEndian);

    if (denominator === 0) {
      throw malformedExif(`${label} has a zero denominator`);
    }

    values.push(numerator / denominator);
  }

  return values;
}

function coordinate(parts: readonly number[]): number {
  return (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
}

function readLocation(gps: TiffIfd | null, littleEndian: boolean): MetadataLocation | null {
  if (gps === null) {
    return null;
  }

  const latitudeRef = readAscii(uniqueEntry(gps, 1), "GPS latitude reference");
  const latitudeParts = readRationals(uniqueEntry(gps, 2), littleEndian, "GPS latitude");
  const longitudeRef = readAscii(uniqueEntry(gps, 3), "GPS longitude reference");
  const longitudeParts = readRationals(uniqueEntry(gps, 4), littleEndian, "GPS longitude");
  const values = [latitudeRef, latitudeParts, longitudeRef, longitudeParts];
  const present = values.filter((value) => value !== null).length;

  if (present === 0) {
    return null;
  }

  if (present !== 4 || latitudeParts === null || longitudeParts === null) {
    throw unsupportedExif("partial GPS coordinates cannot be rewritten safely");
  }

  if (latitudeRef !== "N" && latitudeRef !== "S") {
    throw malformedExif("GPS latitude reference is invalid");
  }

  if (longitudeRef !== "E" && longitudeRef !== "W") {
    throw malformedExif("GPS longitude reference is invalid");
  }

  const latitude = coordinate(latitudeParts);
  const longitude = coordinate(longitudeParts);

  if (latitude > 90 || longitude > 180) {
    throw malformedExif("GPS coordinates are outside their valid range");
  }

  return {
    latitude: latitudeRef === "S" ? -latitude : latitude,
    longitude: longitudeRef === "W" ? -longitude : longitude,
  };
}

function updateManifest(hash: ByteFingerprint, label: string, entry: TiffEntry): void {
  hash.update(new TextEncoder().encode(`${label}:${entry.tag}:${entry.type}:${entry.count}:`));
  hash.update(entry.value);
}

function hashEntries(input: {
  readonly hash: ByteFingerprint;
  readonly label: string;
  readonly entries: readonly TiffEntry[];
  readonly include?: (entry: TiffEntry) => boolean;
}): void {
  const include = input.include ?? (() => true);

  for (const entry of input.entries) {
    if (include(entry)) {
      updateManifest(input.hash, input.label, entry);
    }
  }
}

function hashThumbnail(hash: ByteFingerprint, document: TiffDocument): void {
  if (document.ifd1 === null) {
    return;
  }

  const thumbnailOffset = readShortOrLong(
    uniqueEntry(document.ifd1, TAG_THUMBNAIL_OFFSET),
    document.littleEndian,
    "thumbnail offset",
  );

  const thumbnailLength = readShortOrLong(
    uniqueEntry(document.ifd1, TAG_THUMBNAIL_LENGTH),
    document.littleEndian,
    "thumbnail length",
  );

  if ((thumbnailOffset === null) !== (thumbnailLength === null)) {
    throw malformedExif("EXIF thumbnail is partial");
  }

  if (thumbnailOffset === null || thumbnailLength === null) {
    return;
  }

  ensureTiffSpan(document.tiff, {
    offset: thumbnailOffset,
    length: thumbnailLength,
    label: "EXIF thumbnail",
  });
  hash.update(new TextEncoder().encode("thumbnail:"));
  hash.update(document.tiff.subarray(thumbnailOffset, thumbnailOffset + thumbnailLength));
}

function unmanagedHash(document: TiffDocument): string {
  const hash = new ByteFingerprint();

  const managedIfd0 = new Set([
    TAG_IMAGE_DESCRIPTION,
    TAG_ORIENTATION,
    TAG_GPS_IFD,
    TAG_XP_TITLE,
    TAG_XP_SUBJECT,
  ]);

  hashEntries({
    hash,
    label: "IFD0",
    entries: document.ifd0.entries,
    include: (entry) => !managedIfd0.has(entry.tag),
  });
  hashEntries({ hash, label: "ExifIFD", entries: document.exif?.entries ?? [] });
  hashEntries({
    hash,
    label: "GPSIFD",
    entries: document.gps?.entries ?? [],
    include: (entry) => entry.tag < 1 || entry.tag > 6,
  });
  hashEntries({ hash, label: "InteropIFD", entries: document.interop?.entries ?? [] });
  hashEntries({ hash, label: "IFD1", entries: document.ifd1?.entries ?? [] });
  hashThumbnail(hash, document);

  return hash.digest();
}

function parseOrientation(value: number): Orientation {
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8: {
      return value;
    }

    default: {
      throw malformedExif("EXIF Orientation is outside 1 through 8");
    }
  }
}

/** Parse EXIF metadata while proving all referenced IFD/value spans are valid. */
export function parseExif(payload: Uint8Array): ParsedExif {
  const document = parseTiffDocument(payload);

  const orientationValue = readShort(
    uniqueEntry(document.ifd0, TAG_ORIENTATION),
    document.littleEndian,
    "Orientation",
  );

  return {
    orientation: parseOrientation(orientationValue ?? 1),
    hasOrientation: orientationValue !== null,
    location: readLocation(document.gps, document.littleEndian),
    hasManagedGps: document.gps?.entries.some((entry) => entry.tag >= 1 && entry.tag <= 6) ?? false,
    xpTitle: readXp(uniqueEntry(document.ifd0, TAG_XP_TITLE)),
    xpSubject: readXp(uniqueEntry(document.ifd0, TAG_XP_SUBJECT)),
    hasImageDescription: uniqueEntry(document.ifd0, TAG_IMAGE_DESCRIPTION) !== null,
    unmanagedFingerprint: unmanagedHash(document),
    preservedFingerprint: exifPreservedFingerprint(payload, payload.length),
    payload,
  };
}
