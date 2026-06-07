import { describe, expect, it } from "@effect/vitest";
import { jpegBinaryWithExif, jpegWithXmp } from "./__fixtures__/jpeg.ts";
import { readXmpDescription } from "./xmp.ts";

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
