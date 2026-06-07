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

function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  const chunk = 32_768;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCodePoint(...bytes.subarray(i, i + chunk));
  }
  return out;
}

/** Inject an APP1 XMP packet (carrying `dc:description`) into a JPEG binary string. */
export function jpegWithXmp(jpegBinary: string, description: string): string {
  const xml =
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ` +
    `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li>` +
    `</rdf:Alt></dc:description></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const payload = new TextEncoder().encode(`http://ns.adobe.com/xap/1.0/ ${xml}`);
  const length = payload.length + 2;
  const segment =
    String.fromCodePoint(0xff, 0xe1, Math.trunc(length / 256), length % 256) +
    bytesToBinary(payload);
  // insert the APP1 segment right after SOI (the first two bytes)
  return jpegBinary.slice(0, 2) + segment + jpegBinary.slice(2);
}

/**
 * Like `jpegWithXmp`, but with the *spec-correct* APP1 signature: the namespace URI
 * is NUL-terminated (`…xap/1.0/\0`), not space-separated. Strict parsers (exifreader,
 * ExifTool, Lightroom) only recognise this form — our own reader tolerates either.
 */
export function jpegWithStandardXmp(jpegBinary: string, description: string): string {
  const xml =
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ` +
    `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li>` +
    `</rdf:Alt></dc:description></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const payload = new TextEncoder().encode(`http://ns.adobe.com/xap/1.0/\0${xml}`);
  const length = payload.length + 2;
  const segment =
    String.fromCodePoint(0xff, 0xe1, Math.trunc(length / 256), length % 256) +
    bytesToBinary(payload);
  return jpegBinary.slice(0, 2) + segment + jpegBinary.slice(2);
}

/** Wrap a binary string as an in-memory image File. */
export function fileFromBinary(name: string, binary: string, type: string): File {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return new File([bytes], name, { type });
}
