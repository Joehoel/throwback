import { describe, expect, it } from "@effect/vitest";
import piexif from "piexifjs";
import { jpegBinaryWithExif } from "./__fixtures__/jpeg.ts";
import { EMPTY, readExif } from "./reader.ts";

const hexToBinary = (hex: string): string =>
  String.fromCodePoint(
    ...Array.from({ length: hex.length / 2 }, (_, i) =>
      Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
    ),
  );

/**
 * A minimal little-endian JPEG carrying just an Orientation tag — written as a hex
 * dump (piexif only emits big-endian "MM", so this branch needs a hand-built fixture).
 * TIFF: "II", magic 42, IFD0 @ offset 8; one entry (tag 0x0112 Orientation, type
 * SHORT, count 1, the value little-endian in its 4-byte field), then no next IFD.
 */
function littleEndianOrientation(value: number): string {
  // header "II"+42+IFD0@8 | count 1 | entry: tag 0x0112 (LE 1201), SHORT, count 1 | value | no next IFD
  const valueField = `${value.toString(16).padStart(2, "0")}000000`;
  const tiff = `49492a000800000001001201030001000000${valueField}00000000`;
  const exif = `457869660000${tiff}`; // "Exif\0\0" + TIFF
  const length = (exif.length / 2 + 2).toString(16).padStart(4, "0");
  return hexToBinary(`ffd8ffe1${length}${exif}ffd9`); // SOI + APP1(len) + payload + EOI
}

/**
 * Our own EXIF reader, tested against `piexifjs` as an independent oracle: the
 * fixtures *write* EXIF with the reference library, our reader reads it back.
 */
describe("readExif", () => {
  it("reads the seven tags from big-endian EXIF (piexif-written)", () => {
    const raw = readExif(
      jpegBinaryWithExif({
        lat: 50.0875,
        lon: 14.4214,
        orientation: 6,
        dateTimeOriginal: "2021:07:01 10:00:00",
        description: "Aan het meer",
      }),
    );
    expect(raw.description).toBe("Aan het meer");
    expect(raw.captureDate).toBe("2021:07:01 10:00:00");
    expect(raw.orientation).toBe(6);
    expect(raw.gps?.latRef).toBe("N");
    expect(raw.gps?.lonRef).toBe("E");
    // Convert back with the oracle: the rationals must round-trip to the input degrees.
    expect(piexif.GPSHelper.dmsRationalToDeg(raw.gps?.lat, raw.gps?.latRef)).toBeCloseTo(
      50.0875,
      3,
    );
    expect(piexif.GPSHelper.dmsRationalToDeg(raw.gps?.lon, raw.gps?.lonRef)).toBeCloseTo(
      14.4214,
      3,
    );
  });

  it("reads a little-endian TIFF (orientation only)", () => {
    expect(readExif(littleEndianOrientation(6)).orientation).toBe(6);
  });

  it("omits gps when coordinates are absent", () => {
    expect(readExif(jpegBinaryWithExif({ orientation: 3 })).gps).toBeNull();
  });

  it("returns EMPTY for EXIF-less JPEG and for non-JPEG input", () => {
    expect(readExif(jpegBinaryWithExif())).toEqual(EMPTY);
    expect(readExif("definitely not a jpeg")).toEqual(EMPTY);
  });

  it("degrades a truncated EXIF segment to nulls instead of throwing", () => {
    const truncated = jpegBinaryWithExif({ description: "Aan het meer" }).slice(0, 40);
    expect(() => readExif(truncated)).not.toThrow();
  });
});
