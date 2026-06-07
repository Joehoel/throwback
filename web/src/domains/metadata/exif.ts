import type { Location } from "#/domains/shared/photo.ts";
import { bytesToBinary, readU16, readU32, writeU16, writeU32 } from "./binary.ts";
import { EXIF_HEADER, findExifSegment } from "./segments.ts";

/**
 * EXIF *write* codec — a lossless TIFF read+serialise that merges our managed tags
 * into the existing EXIF and re-emits the whole block (ADR-0019). "Lossless" =
 * every existing tag in IFD0/Exif/GPS is preserved by relocating its raw value
 * bytes; only the thumbnail (1st IFD) and the Interop sub-IFD are dropped (as
 * piexif also does). This is the imperative byte merge ADR-0019 calls for — not a
 * Schema encode — and the counterpart to `reader.ts`.
 *
 * We write Locatie + Oriëntatie to EXIF, and mirror Beschrijving to the Windows
 * XP tags (UTF-16LE, accent-safe) so Explorer shows it; the canonical Beschrijving
 * is XMP `dc:description` (`xmp.ts`). EXIF `ImageDescription` is never written — it
 * mangles non-ASCII (ADR-0019).
 *
 * Caveat (matches piexif): tags whose values embed absolute offsets — notably
 * MakerNote — aren't rewritten, so they can break on relocation. Acceptable for the
 * "visually lossless" bar (pixels + ICC + the tags renderers read are preserved).
 */

const NUL = String.fromCodePoint(0);

// Byte count per EXIF value type (index = type id); 0 for unsupported.
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 0, 4, 8] as const;
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const BYTE = 1;
const RATIONAL = 5;

const ORIENTATION = 274;
const XP_TITLE = 40_091;
const XP_SUBJECT = 40_095;
const EXIF_POINTER = 34_665;
const GPS_POINTER = 34_853;
const INTEROP_POINTER = 40_965; // lives in the Exif IFD; dropped (we don't copy Interop)
const GPS_LAT_REF = 1;
const GPS_LAT = 2;
const GPS_LON_REF = 3;
const GPS_LON = 4;

/** One IFD entry, value held as raw bytes (source endianness) for lossless relocation. */
interface Tag {
  readonly type: number;
  readonly count: number;
  readonly data: string;
}
type Ifd = Map<number, Tag>;

/** The three IFDs we round-trip, plus the byte order to re-emit in. */
interface Tiff {
  readonly ifd0: Ifd;
  readonly exif: Ifd;
  readonly gps: Ifd;
  readonly le: boolean;
}

/** The fields the curation writes; `null` means "leave whatever is already there". */
export interface ExifEdit {
  readonly orientation: number | null;
  readonly location: Location | null;
  readonly description: string | null;
}

// --- parse (read every tag, keep raw value bytes) ---

function readIfd(tiff: string, pointer: number, le: boolean): Ifd {
  const ifd: Ifd = new Map();
  const count = readU16(tiff, pointer, le);
  for (let i = 0; i < count; i += 1) {
    const base = pointer + 2 + 12 * i;
    const tag = readU16(tiff, base, le);
    const type = readU16(tiff, base + 2, le);
    const length = readU32(tiff, base + 4, le);
    const bytes = length * (TYPE_SIZE[type] ?? 1);
    const at = bytes <= 4 ? base + 8 : readU32(tiff, base + 8, le);
    ifd.set(tag, { type, count: length, data: tiff.slice(at, at + bytes) });
  }
  return ifd;
}

const pointerOf = (ifd: Ifd, tag: number, le: boolean): number | null => {
  const entry = ifd.get(tag);
  return entry === undefined ? null : readU32(entry.data, 0, le);
};

/** Parse a JPEG's EXIF into editable IFDs (empty + big-endian if there is none). */
function parseTiff(jpeg: string): Tiff {
  const segment = findExifSegment(jpeg);
  if (segment === null) {
    return { ifd0: new Map(), exif: new Map(), gps: new Map(), le: false };
  }
  const { tiff, le } = segment;
  const ifd0 = readIfd(tiff, readU32(tiff, 4, le), le);
  const exifPtr = pointerOf(ifd0, EXIF_POINTER, le);
  const gpsPtr = pointerOf(ifd0, GPS_POINTER, le);
  const exif = exifPtr === null ? new Map() : readIfd(tiff, exifPtr, le);
  const gps = gpsPtr === null ? new Map() : readIfd(tiff, gpsPtr, le);
  // The pointers are re-derived on serialise; Interop/thumbnail aren't carried.
  ifd0.delete(EXIF_POINTER);
  ifd0.delete(GPS_POINTER);
  exif.delete(INTEROP_POINTER);
  return { ifd0, exif, gps, le };
}

// --- value byte builders ---

/** Degrees/minutes/seconds as three EXIF rationals. */
type Dms = readonly (readonly [number, number])[];

/** Decimal degrees → the EXIF DMS rationals `[[deg,1],[min,1],[sec,100]]`. */
const toDms = (value: number): Dms => {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100);
  return [
    [deg, 1],
    [min, 1],
    [sec, 100],
  ];
};

const rationalBytes = (dms: Dms, le: boolean): string =>
  dms
    .map(([numerator, denominator]) => writeU32(numerator, le) + writeU32(denominator, le))
    .join("");

/** A GPS ref ("N"/"S"/"E"/"W") as a 2-byte null-terminated ASCII value. */
const refBytes = (ref: string): string => String.fromCodePoint(ref.codePointAt(0) ?? 0) + NUL;

// UTF-16 surrogate-pair arithmetic for code points above the Basic Multilingual Plane.
const BMP_MAX = 65_535; // 0xFFFF
const ASTRAL_BASE = 65_536; // 0x10000
const HIGH_SURROGATE = 55_296; // 0xD800
const LOW_SURROGATE = 56_320; // 0xDC00
const SURROGATE_SPAN = 1024; // 0x400

/** A code point as its UTF-16 code unit(s) (one, or a surrogate pair above the BMP). */
const toCodeUnits = (point: number): readonly number[] =>
  point > BMP_MAX
    ? [
        HIGH_SURROGATE + Math.trunc((point - ASTRAL_BASE) / SURROGATE_SPAN),
        LOW_SURROGATE + ((point - ASTRAL_BASE) % SURROGATE_SPAN),
      ]
    : [point];

/** UTF-16LE bytes (+ null terminator) for a Windows XP* tag. */
function utf16leBytes(text: string): string {
  let out = "";
  for (const character of text) {
    for (const unit of toCodeUnits(character.codePointAt(0) ?? 0)) {
      out += String.fromCodePoint(unit % 256, Math.trunc(unit / 256));
    }
  }
  return `${out}${NUL}${NUL}`;
}

// --- merge our managed tags into the parsed IFDs ---

function merge(tiff: Tiff, edit: ExifEdit): void {
  const { ifd0, gps, le } = tiff;
  if (edit.orientation !== null) {
    ifd0.set(ORIENTATION, { type: SHORT, count: 1, data: writeU16(edit.orientation, le) });
  }
  if (edit.description !== null) {
    const value = utf16leBytes(edit.description);
    const tag: Tag = { type: BYTE, count: value.length, data: value };
    ifd0.set(XP_TITLE, tag);
    ifd0.set(XP_SUBJECT, tag);
  }
  if (edit.location !== null) {
    const { latitude, longitude } = edit.location;
    gps.set(GPS_LAT_REF, { type: ASCII, count: 2, data: refBytes(latitude >= 0 ? "N" : "S") });
    gps.set(GPS_LAT, { type: RATIONAL, count: 3, data: rationalBytes(toDms(latitude), le) });
    gps.set(GPS_LON_REF, { type: ASCII, count: 2, data: refBytes(longitude >= 0 ? "E" : "W") });
    gps.set(GPS_LON, { type: RATIONAL, count: 3, data: rationalBytes(toDms(longitude), le) });
  }
}

// --- serialise ---

const align2 = (length: number): number => length + (length % 2);

/** Byte length an IFD will occupy: its table + the word-aligned overflow values. */
function ifdLength(ifd: Ifd): number {
  let overflow = 0;
  for (const { data } of ifd.values()) {
    if (data.length > 4) {
      overflow += align2(data.length);
    }
  }
  return 2 + 12 * ifd.size + 4 + overflow;
}

/** Serialise one IFD (table + overflow), entries ascending by tag (TIFF requires it). */
function serializeIfd(ifd: Ifd, baseOffset: number, le: boolean): string {
  const entries = [...ifd.entries()].toSorted(([a], [b]) => a - b);
  let table = writeU16(entries.length, le);
  let overflow = "";
  let cursor = baseOffset + 2 + 12 * entries.length + 4;
  for (const [tag, value] of entries) {
    let field: string;
    if (value.data.length <= 4) {
      field = value.data + NUL.repeat(4 - value.data.length);
    } else {
      field = writeU32(cursor, le);
      const blob = value.data.length % 2 === 1 ? value.data + NUL : value.data;
      overflow += blob;
      cursor += blob.length;
    }
    table += writeU16(tag, le) + writeU16(value.type, le) + writeU32(value.count, le) + field;
  }
  return `${table}${writeU32(0, le)}${overflow}`; // next-IFD pointer = 0 (no 1st/thumbnail)
}

const pointerTag = (offset: number, le: boolean): Tag => ({
  type: LONG,
  count: 1,
  data: writeU32(offset, le),
});

/** Re-emit the TIFF block: header → IFD0 → Exif IFD → GPS IFD (each with overflow). */
function serializeTiff(tiff: Tiff): string {
  const { ifd0, exif, gps, le } = tiff;
  const hasExif = exif.size > 0;
  const hasGps = gps.size > 0;
  // Add the sub-IFD pointers so IFD0's size is fixed before we compute offsets.
  if (hasExif) {
    ifd0.set(EXIF_POINTER, pointerTag(0, le));
  }
  if (hasGps) {
    ifd0.set(GPS_POINTER, pointerTag(0, le));
  }

  const exifOffset = 8 + ifdLength(ifd0);
  const gpsOffset = exifOffset + (hasExif ? ifdLength(exif) : 0);
  if (hasExif) {
    ifd0.set(EXIF_POINTER, pointerTag(exifOffset, le));
  }
  if (hasGps) {
    ifd0.set(GPS_POINTER, pointerTag(gpsOffset, le));
  }

  const header = (le ? "II" : "MM") + writeU16(42, le) + writeU32(8, le); // IFD0 starts at 8
  return (
    header +
    serializeIfd(ifd0, 8, le) +
    (hasExif ? serializeIfd(exif, exifOffset, le) : "") +
    (hasGps ? serializeIfd(gps, gpsOffset, le) : "")
  );
}

/** Wrap a TIFF block in an APP1 Exif segment (`0xFFE1 len "Exif\0\0" tiff`). */
function buildApp1(tiff: string): string {
  const payload = bytesToBinary(new TextEncoder().encode(EXIF_HEADER)) + tiff;
  const length = payload.length + 2; // length counts its own 2 bytes
  return String.fromCodePoint(0xff, 0xe1) + writeU16(length, false) + payload;
}

/**
 * Merge `edit` into the JPEG's EXIF and return the new JPEG binary string: replaces
 * any existing APP1 Exif segment with the re-serialised one, inserted just after SOI.
 * All other segments (XMP/ICC/pixels) are untouched.
 */
export function writeExif(jpegBinary: string, edit: ExifEdit): string {
  const tiff = parseTiff(jpegBinary);
  merge(tiff, edit);
  const app1 = buildApp1(serializeTiff(tiff));
  const existing = findExifSegment(jpegBinary);
  const without =
    existing === null
      ? jpegBinary
      : jpegBinary.slice(0, existing.start) + jpegBinary.slice(existing.end);
  return without.slice(0, 2) + app1 + without.slice(2); // insert just after SOI
}
