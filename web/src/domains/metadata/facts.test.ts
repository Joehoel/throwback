import { describe, expect, it } from "@effect/vitest";
import piexif from "piexifjs";
import { decodeMetadata } from "./facts.ts";

/** Declarative read transforms: raw EXIF/XMP values → domain facts. */
describe("decodeMetadata", () => {
  it("prefers XMP description, parses year, decodes GPS to decimal", () => {
    const facts = decodeMetadata({
      description: { xmp: "xmp-tekst", exif: "exif-tekst" },
      year: "2007:03:14 15:24:52",
      location: {
        lat: piexif.GPSHelper.degToDmsRational(52.1),
        latRef: "N",
        lon: piexif.GPSHelper.degToDmsRational(5.2),
        lonRef: "E",
      },
      orientation: 6,
    });
    expect(facts.description).toBe("xmp-tekst");
    expect(facts.year).toBe(2007);
    expect(facts.location?.latitude).toBeCloseTo(52.1, 3);
    expect(facts.location?.longitude).toBeCloseTo(5.2, 3);
    expect(facts.orientation).toBe(6);
  });

  it("falls back to EXIF description, defaults orientation, leaves GPS/year null", () => {
    const facts = decodeMetadata({
      description: { xmp: null, exif: "alleen-exif" },
      year: null,
      location: null,
      orientation: null,
    });
    expect(facts.description).toBe("alleen-exif");
    expect(facts.orientation).toBe(1);
    expect(facts.location).toBeNull();
    expect(facts.year).toBeNull();
  });

  it("treats a blank description as absent", () => {
    const facts = decodeMetadata({
      description: { xmp: "   ", exif: null },
      year: null,
      location: null,
      orientation: null,
    });
    expect(facts.description).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    const facts = decodeMetadata({
      description: { xmp: null, exif: null },
      year: null,
      location: {
        lat: piexif.GPSHelper.degToDmsRational(120),
        latRef: "N",
        lon: piexif.GPSHelper.degToDmsRational(5),
        lonRef: "E",
      },
      orientation: null,
    });
    expect(facts.location).toBeNull();
  });
});
