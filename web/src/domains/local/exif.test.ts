import { describe, expect, it } from "@effect/vitest";
import { blobToBinaryString, readExif } from "./exif.ts";
import { jpegBinaryWithExif } from "./__fixtures__/jpeg.ts";

describe("readExif", () => {
  it("reads GPS, orientation, description and capture year from EXIF", () => {
    const jpeg = jpegBinaryWithExif({
      lat: 50.0875,
      lon: 14.4214,
      orientation: 6,
      dateTimeOriginal: "2021:07:01 10:00:00",
      description: "Aan het meer",
    });
    const facts = readExif(jpeg);
    expect(facts.year).toBe(2021);
    expect(facts.orientation).toBe(6);
    expect(facts.description).toBe("Aan het meer");
    expect(facts.location?.latitude).toBeCloseTo(50.0875, 3);
    expect(facts.location?.longitude).toBeCloseTo(14.4214, 3);
  });

  it("returns empty facts for non-JPEG / EXIF-less input", () => {
    expect(readExif("definitely not a jpeg")).toEqual({
      year: null,
      description: null,
      location: null,
      orientation: 1,
    });
  });

  it("yields no location when GPS is absent", () => {
    expect(readExif(jpegBinaryWithExif({ orientation: 3 })).location).toBeNull();
  });
});

describe("blobToBinaryString", () => {
  it("round-trips raw bytes, one char per byte", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 254, 255])]);
    const binary = await blobToBinaryString(blob);
    expect(Array.from(binary, (char) => char.codePointAt(0))).toEqual([0, 1, 2, 254, 255]);
  });
});
