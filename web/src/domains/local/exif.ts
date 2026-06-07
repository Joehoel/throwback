import piexif from "piexifjs";
import type { Location } from "#/domains/shared/photo.ts";

/**
 * EXIF extraction for the local photo source — the read counterpart to the
 * EXIF write-back (P-next). Pure format extraction (no Effect, no domain
 * projection); the domain mapper (`mapper.ts`) turns these into a `Photo`.
 *
 * Note (ADR-0008 divergence): OneDrive exposes a *derived* `location` facet, so
 * the production path never reads raw EXIF GPS. A local folder has no such facet,
 * so here we read raw EXIF — a deliberate, local-test-only divergence.
 */

export interface ExifFacts {
  /** Capture year from `DateTimeOriginal`, or null when absent/garbled. */
  readonly year: number | null;
  /** `ImageDescription`, or null when absent/blank. */
  readonly description: string | null;
  /** GPS as domain `Location`, or null when absent/out-of-range. */
  readonly location: Location | null;
  /** EXIF orientation flag 1–8 (1 = upright). Used by the later write-back. */
  readonly orientation: number;
}

const EMPTY: ExifFacts = { year: null, description: null, location: null, orientation: 1 };

/** Read a Blob into a binary string (one char per byte) — the shape piexifjs reads. */
export async function blobToBinaryString(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  const chunk = 32_768; // chunked to stay under the arg-count limit of fromCodePoint
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCodePoint(...bytes.subarray(i, i + chunk));
  }
  return out;
}

const inRange = (n: number, min: number, max: number): boolean =>
  Number.isFinite(n) && n >= min && n <= max;

/** GPS IFD -> domain Location, or null unless a valid lat & lon are both present. */
function parseGps(gps: Record<number, unknown> | undefined): Location | null {
  if (gps === undefined) {
    return null;
  }
  const lat = gps[piexif.GPSIFD.GPSLatitude];
  const latRef = gps[piexif.GPSIFD.GPSLatitudeRef];
  const lon = gps[piexif.GPSIFD.GPSLongitude];
  const lonRef = gps[piexif.GPSIFD.GPSLongitudeRef];
  if (
    lat === undefined ||
    lon === undefined ||
    typeof latRef !== "string" ||
    typeof lonRef !== "string"
  ) {
    return null;
  }
  const latitude = piexif.GPSHelper.dmsRationalToDeg(lat, latRef);
  const longitude = piexif.GPSHelper.dmsRationalToDeg(lon, lonRef);
  if (inRange(latitude, -90, 90) && inRange(longitude, -180, 180)) {
    return { latitude, longitude };
  }
  return null;
}

/**
 * Read the EXIF facts the curator cares about. Non-JPEG or EXIF-less input makes
 * `piexif.load` throw — treated as "no EXIF" rather than an error (a PNG without
 * GPS is a normal, expected case for a local folder).
 */
export function readExif(jpegBinary: string): ExifFacts {
  let data: ReturnType<typeof piexif.load>;
  try {
    data = piexif.load(jpegBinary);
  } catch {
    return EMPTY;
  }
  const zeroth = data["0th"] ?? {};
  const exif = data.Exif ?? {};

  const captured = exif[piexif.ExifIFD.DateTimeOriginal]; // "YYYY:MM:DD HH:MM:SS"
  const yearMatch = typeof captured === "string" ? /^(?<year>\d{4})/u.exec(captured) : null;
  const year = yearMatch?.groups?.year === undefined ? null : Number(yearMatch.groups.year);

  const descRaw = zeroth[piexif.ImageIFD.ImageDescription];
  const description = typeof descRaw === "string" && descRaw.trim() !== "" ? descRaw : null;

  const orientationRaw = zeroth[piexif.ImageIFD.Orientation];
  const orientation = typeof orientationRaw === "number" ? orientationRaw : 1;

  return { year, description, location: parseGps(data.GPS), orientation };
}
