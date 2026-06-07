import { describe, expect, it } from "@effect/vitest";
import { jpegBinaryWithExif, jpegWithXmp } from "./__fixtures__/jpeg.ts";
import { readExif } from "./reader.ts";
import { readXmpDescription, writeXmpDescription } from "./xmp.ts";

describe("readXmpDescription", () => {
  it("reads dc:description as UTF-8 (accents intact)", () => {
    const jpeg = jpegWithXmp(jpegBinaryWithExif(), "Joël naar de Eben Haëzerschool");
    expect(readXmpDescription(jpeg)).toBe("Joël naar de Eben Haëzerschool");
  });

  it("decodes XML entities", () => {
    const jpeg = jpegWithXmp(jpegBinaryWithExif(), "Anne &amp; Tom");
    expect(readXmpDescription(jpeg)).toBe("Anne & Tom");
  });

  it("returns null when there is no XMP packet", () => {
    expect(readXmpDescription(jpegBinaryWithExif())).toBeNull();
  });
});

describe("writeXmpDescription", () => {
  it("round-trips a description with accents", () => {
    const jpeg = writeXmpDescription(jpegBinaryWithExif(), "Joël aan het meer");
    expect(readXmpDescription(jpeg)).toBe("Joël aan het meer");
  });

  it("escapes XML-significant characters", () => {
    const jpeg = writeXmpDescription(jpegBinaryWithExif(), "Anne & <Tom>");
    expect(readXmpDescription(jpeg)).toBe("Anne & <Tom>");
  });

  it("replaces an existing XMP packet (no duplicate)", () => {
    const once = jpegWithXmp(jpegBinaryWithExif(), "oud");
    const twice = writeXmpDescription(once, "nieuw");
    expect(readXmpDescription(twice)).toBe("nieuw");
    expect(twice.split("http://ns.adobe.com/xap/1.0/").length - 1).toBe(1);
  });

  it("preserves EXIF (lossless merge)", () => {
    const jpeg = writeXmpDescription(
      jpegBinaryWithExif({ orientation: 6, description: "exif-only" }),
      "via xmp",
    );
    const raw = readExif(jpeg);
    expect(raw.orientation).toBe(6);
    expect(raw.description).toBe("exif-only"); // EXIF ImageDescription untouched
    expect(readXmpDescription(jpeg)).toBe("via xmp");
  });
});
