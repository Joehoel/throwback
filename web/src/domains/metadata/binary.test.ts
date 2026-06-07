import { describe, expect, it } from "@effect/vitest";
import { blobToBinaryString, crc32 } from "./binary.ts";

describe("blobToBinaryString", () => {
  it("round-trips raw bytes, one char per byte", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 254, 255])]);
    const binary = await blobToBinaryString(blob);
    expect(Array.from(binary, (char) => char.codePointAt(0))).toEqual([0, 1, 2, 254, 255]);
  });
});

describe("crc32", () => {
  it("matches the standard check vector for '123456789'", () => {
    expect(crc32("123456789")).toBe(0xcb_f4_39_26);
  });
});
