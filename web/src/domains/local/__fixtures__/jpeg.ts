import piexif from "piexifjs";

/**
 * Test-only fixtures: build real JPEGs with injected EXIF (the same piexifjs
 * round-trip the `spike/piexif_check.mjs` verified) and wrap bytes as `File`s, so
 * the local source's read path can be exercised without a real browser/folder.
 */

// A valid 1×1 baseline JPEG without EXIF (from spike/piexif_check.mjs).
const BASE_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
  "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";

export interface ExifOptions {
  lat?: number;
  lon?: number;
  orientation?: number;
  dateTimeOriginal?: string; // "YYYY:MM:DD HH:MM:SS"
  description?: string;
}

/** A JPEG binary string with the given EXIF injected (empty options → no EXIF). */
export function jpegBinaryWithExif(options: ExifOptions = {}): string {
  const base = Buffer.from(BASE_JPEG_B64, "base64").toString("binary");
  if (Object.keys(options).length === 0) {
    return base;
  }

  const zeroth: Record<number, unknown> = {};
  const exifIfd: Record<number, unknown> = {};
  const gps: Record<number, unknown> = {};

  if (options.orientation !== undefined) {
    zeroth[piexif.ImageIFD.Orientation] = options.orientation;
  }
  if (options.description !== undefined) {
    zeroth[piexif.ImageIFD.ImageDescription] = options.description;
  }
  if (options.dateTimeOriginal !== undefined) {
    exifIfd[piexif.ExifIFD.DateTimeOriginal] = options.dateTimeOriginal;
  }
  if (options.lat !== undefined && options.lon !== undefined) {
    gps[piexif.GPSIFD.GPSLatitudeRef] = options.lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(options.lat));
    gps[piexif.GPSIFD.GPSLongitudeRef] = options.lon >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(options.lon));
  }

  return piexif.insert(piexif.dump({ "0th": zeroth, Exif: exifIfd, GPS: gps }), base);
}

/** Wrap a binary string as an in-memory image File. */
export function fileFromBinary(name: string, binary: string, type: string): File {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return new File([bytes], name, { type });
}
