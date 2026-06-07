import { describe, expect, it } from "@effect/vitest";
import { pngBinary } from "./__fixtures__/png.ts";
import { crc32, readU32 } from "./binary.ts";
import { readPngDescription, writePngDescription } from "./png.ts";

describe("PNG XMP", () => {
  it("round-trips a description with accents", () => {
    const png = writePngDescription(pngBinary(), "Joël aan het meer");
    expect(readPngDescription(png)).toBe("Joël aan het meer");
  });

  it("escapes XML-significant characters", () => {
    const png = writePngDescription(pngBinary(), "Anne & <Tom>");
    expect(readPngDescription(png)).toBe("Anne & <Tom>");
  });

  it("returns null when there is no XMP chunk", () => {
    expect(readPngDescription(pngBinary())).toBeNull();
  });

  it("replaces an existing XMP chunk (no duplicate)", () => {
    const once = writePngDescription(pngBinary(), "oud");
    const twice = writePngDescription(once, "nieuw");
    expect(readPngDescription(twice)).toBe("nieuw");
    expect(twice.split("XML:com.adobe.xmp").length - 1).toBe(1);
  });

  it("keeps the signature, IHDR and IEND (lossless)", () => {
    const png = writePngDescription(pngBinary(), "x");
    expect(png.startsWith(pngBinary().slice(0, 8 + 25))).toBe(true); // signature + IHDR untouched
    expect(png.endsWith(`IEND${String.fromCodePoint(0, 0, 0, 0)}`)).toBe(true);
  });

  it("writes a chunk with a valid CRC", () => {
    const png = writePngDescription(pngBinary(), "x");
    // The iTXt chunk sits right after IHDR (signature 8 + IHDR 25).
    const pos = 8 + 25;
    const length = readU32(png, pos, false);
    const typeAndData = png.slice(pos + 4, pos + 8 + length);
    const stored = readU32(png, pos + 8 + length, false);
    expect(stored).toBe(crc32(typeAndData));
  });
});
