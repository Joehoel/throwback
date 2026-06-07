import { readU16, readU32 } from "./binary.ts";
import { findExifSegment } from "./segments.ts";

/**
 * EXIF *binary* reader — our own read-only walk of the JPEG → APP1/Exif → TIFF →
 * IFD structure, replacing `piexifjs` in the app (it stays in `.context/` as the
 * reference this was written against, and as the test oracle). We read exactly the
 * seven tags four facts need; the *value* interpretation (decimal GPS, year,
 * orientation default, trim) lives declaratively in `facts.ts` (ADR-0019).
 *
 * This is the one byte-tokenizing seam that can't be a Schema: EXIF is
 * offset-indirected (an IFD entry's 4 bytes are an inline value *or* a pointer
 * elsewhere in the buffer), which Schema's in-place decode can't follow. So it's a
 * pure reader over a latin1 binary string (one char per byte); Schema owns
 * everything above it. Out-of-range reads yield 0/"" rather than throwing
 * (`codePointAt` → undefined → 0, `slice` clamps), so malformed EXIF degrades to
 * nulls the read schema rejects — the service wraps this in one `Effect.try` net.
 */

/** A single EXIF RATIONAL: `[numerator, denominator]`. */
export type Rational = readonly [number, number];
/** GPS degrees/minutes/seconds as three rationals (the EXIF GPSLatitude shape). */
export type Rational3 = readonly [Rational, Rational, Rational];

/** GPS tags straight from the EXIF GPS-IFD (rationals + N/S/E/W refs), uninterpreted. */
export interface RawGps {
  readonly lat: Rational3;
  readonly latRef: string;
  readonly lon: Rational3;
  readonly lonRef: string;
}

/** Raw EXIF values the codec hands to the read schema. */
export interface RawExif {
  readonly description: string | null;
  readonly captureDate: string | null;
  readonly orientation: number | null;
  readonly gps: RawGps | null;
}

/** No JPEG / no EXIF — every fact absent. */
export const EMPTY: RawExif = {
  description: null,
  captureDate: null,
  orientation: null,
  gps: null,
};

// The seven tags we read, plus the two sub-IFD pointers (Exif → 34665, GPS → 34853).
const TAG = {
  description: 270, // ImageDescription (ASCII)
  orientation: 274, // Orientation (SHORT)
  exifIfd: 34_665, // pointer → Exif sub-IFD (LONG)
  gpsIfd: 34_853, // pointer → GPS sub-IFD (LONG)
  captureDate: 36_867, // DateTimeOriginal (ASCII)
  gpsLatRef: 1, // ASCII "N"/"S"
  gpsLat: 2, // RATIONAL × 3
  gpsLonRef: 3, // ASCII "E"/"W"
  gpsLon: 4, // RATIONAL × 3
} as const;

/** The TIFF block plus its byte order (EXIF is little- *or* big-endian). */
interface Tiff {
  readonly data: string;
  readonly le: boolean;
}

/** One IFD entry's header: its type, element count, and the offset of its 4-byte value field. */
interface Entry {
  readonly type: number;
  readonly count: number;
  readonly field: number;
}

/** Locate the APP1 Exif segment's TIFF block + byte order, or null. */
function findTiff(jpeg: string): Tiff | null {
  const seg = findExifSegment(jpeg);
  return seg === null ? null : { data: seg.tiff, le: seg.le };
}

/** Index one IFD's entries by tag. */
function readIfd(tiff: Tiff, pointer: number): ReadonlyMap<number, Entry> {
  const entries = new Map<number, Entry>();
  const count = readU16(tiff.data, pointer, tiff.le);
  for (let i = 0; i < count; i += 1) {
    const base = pointer + 2 + 12 * i;
    entries.set(readU16(tiff.data, base, tiff.le), {
      type: readU16(tiff.data, base + 2, tiff.le),
      count: readU32(tiff.data, base + 4, tiff.le),
      field: base + 8,
    });
  }
  return entries;
}

/** ASCII string value (trailing NUL dropped); inline when it fits the 4-byte field. */
const ascii = (tiff: Tiff, entry: Entry): string => {
  const start = entry.count > 4 ? readU32(tiff.data, entry.field, tiff.le) : entry.field;
  return tiff.data.slice(start, start + Math.max(entry.count - 1, 0));
};

/** A single SHORT value (orientation is always inline). */
const short = (tiff: Tiff, entry: Entry): number => readU16(tiff.data, entry.field, tiff.le);

/** Three RATIONALs (GPS lat/lon), always stored at an offset. */
const rational3 = (tiff: Tiff, entry: Entry): Rational3 => {
  const base = readU32(tiff.data, entry.field, tiff.le);
  const at = (k: number): Rational => [
    readU32(tiff.data, base + k * 8, tiff.le),
    readU32(tiff.data, base + k * 8 + 4, tiff.le),
  ];
  return [at(0), at(1), at(2)];
};

/** Follow a sub-IFD pointer entry to its IFD. */
const subIfd = (tiff: Tiff, pointer: Entry): ReadonlyMap<number, Entry> =>
  readIfd(tiff, readU32(tiff.data, pointer.field, tiff.le));

function readGps(gps: ReadonlyMap<number, Entry>, tiff: Tiff): RawGps | null {
  const lat = gps.get(TAG.gpsLat);
  const lon = gps.get(TAG.gpsLon);
  const latRef = gps.get(TAG.gpsLatRef);
  const lonRef = gps.get(TAG.gpsLonRef);
  if (lat === undefined || lon === undefined || latRef === undefined || lonRef === undefined) {
    return null;
  }
  return {
    lat: rational3(tiff, lat),
    latRef: ascii(tiff, latRef),
    lon: rational3(tiff, lon),
    lonRef: ascii(tiff, lonRef),
  };
}

/** Read the raw EXIF tags from a JPEG binary string. Non-JPEG / EXIF-less → `EMPTY`. */
export function readExif(jpeg: string): RawExif {
  const tiff = findTiff(jpeg);
  if (tiff === null) {
    return EMPTY;
  }
  const ifd0 = readIfd(tiff, readU32(tiff.data, 4, tiff.le));

  const description = ifd0.get(TAG.description);
  const orientation = ifd0.get(TAG.orientation);
  const exifPtr = ifd0.get(TAG.exifIfd);
  const gpsPtr = ifd0.get(TAG.gpsIfd);

  const captureDate =
    exifPtr === undefined ? undefined : subIfd(tiff, exifPtr).get(TAG.captureDate);

  return {
    description: description === undefined ? null : ascii(tiff, description),
    captureDate: captureDate === undefined ? null : ascii(tiff, captureDate),
    orientation: orientation === undefined ? null : short(tiff, orientation),
    gps: gpsPtr === undefined ? null : readGps(subIfd(tiff, gpsPtr), tiff),
  };
}
