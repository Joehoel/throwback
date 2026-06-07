import { describe, expect, it } from "@effect/vitest";
import piexif from "piexifjs";
import { jpegBinaryWithExif } from "./__fixtures__/jpeg.ts";
import { writeExif } from "./exif.ts";
import { readExif } from "./reader.ts";
import { EXIF_HEADER } from "./segments.ts";
import { readXmpDescription, writeXmpDescription } from "./xmp.ts";

const NONE = { orientation: null, location: null, description: null } as const;

/** Round-trips through our own reader; GPS is cross-checked with piexif as oracle. */
describe("writeExif", () => {
  it("writes orientation into a JPEG that had no EXIF", () => {
    const jpeg = writeExif(jpegBinaryWithExif(), { ...NONE, orientation: 6 });
    expect(readExif(jpeg).orientation).toBe(6);
  });

  it("writes GPS that round-trips to the input degrees", () => {
    const jpeg = writeExif(jpegBinaryWithExif(), {
      ...NONE,
      location: { latitude: 52.1, longitude: 5.2 },
    });
    const gps = readExif(jpeg).gps;
    expect(piexif.GPSHelper.dmsRationalToDeg(gps?.lat, gps?.latRef)).toBeCloseTo(52.1, 3);
    expect(piexif.GPSHelper.dmsRationalToDeg(gps?.lon, gps?.lonRef)).toBeCloseTo(5.2, 3);
    expect(gps?.latRef).toBe("N");
    expect(gps?.lonRef).toBe("E");
  });

  it("uses S/W refs for the southern/western hemisphere", () => {
    const jpeg = writeExif(jpegBinaryWithExif(), {
      ...NONE,
      location: { latitude: -33.9, longitude: -70.6 },
    });
    const gps = readExif(jpeg).gps;
    expect(gps?.latRef).toBe("S");
    expect(gps?.lonRef).toBe("W");
    expect(piexif.GPSHelper.dmsRationalToDeg(gps?.lat, gps?.latRef)).toBeCloseTo(-33.9, 3);
  });

  it("preserves existing EXIF tags (DateTimeOriginal) while merging new ones", () => {
    const original = jpegBinaryWithExif({
      orientation: 3,
      dateTimeOriginal: "2019:01:01 00:00:00",
    });
    const jpeg = writeExif(original, {
      ...NONE,
      orientation: 6,
      location: { latitude: 1, longitude: 2 },
    });
    const raw = readExif(jpeg);
    expect(raw.captureDate).toBe("2019:01:01 00:00:00"); // preserved
    expect(raw.orientation).toBe(6); // updated
    expect(raw.gps).not.toBeNull(); // added
  });

  it("mirrors the description to the Windows XP tags as UTF-16LE (accent-safe)", () => {
    const jpeg = writeExif(jpegBinaryWithExif(), { ...NONE, description: "Joël" });
    // "Joël" in UTF-16LE: J o ë l, each low-byte then high-byte (0).
    const utf16le = String.fromCodePoint(0x4a, 0, 0x6f, 0, 0xeb, 0, 0x6c, 0);
    expect(jpeg.includes(utf16le)).toBe(true);
  });

  it("replaces the existing EXIF segment instead of adding a second one", () => {
    const once = jpegBinaryWithExif({ orientation: 1 });
    const twice = writeExif(once, { ...NONE, orientation: 8 });
    expect(readExif(twice).orientation).toBe(8);
    expect(twice.split(EXIF_HEADER).length - 1).toBe(1);
  });

  it("produces EXIF the reference library (piexif) reads back", () => {
    const jpeg = writeExif(jpegBinaryWithExif(), {
      ...NONE,
      orientation: 6,
      location: { latitude: 52.1, longitude: 5.2 },
    });
    const dict = piexif.load(jpeg);
    expect(dict["0th"]?.[piexif.ImageIFD.Orientation]).toBe(6);
    expect(dict.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
    const lat = piexif.GPSHelper.dmsRationalToDeg(
      dict.GPS?.[piexif.GPSIFD.GPSLatitude],
      dict.GPS?.[piexif.GPSIFD.GPSLatitudeRef],
    );
    expect(lat).toBeCloseTo(52.1, 3);
  });

  it("leaves a sibling XMP segment intact (lossless merge)", () => {
    const withXmp = writeXmpDescription(jpegBinaryWithExif(), "Joël aan het meer");
    const jpeg = writeExif(withXmp, { ...NONE, orientation: 6 });
    expect(readExif(jpeg).orientation).toBe(6);
    expect(readXmpDescription(jpeg)).toBe("Joël aan het meer");
  });
});
