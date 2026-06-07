import { describe, expect, it } from "@effect/vitest";
import { blobToBinaryString } from "./binary.ts";

describe("blobToBinaryString", () => {
  it("round-trips raw bytes, one char per byte", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 254, 255])]);
    const binary = await blobToBinaryString(blob);
    expect(Array.from(binary, (char) => char.codePointAt(0))).toEqual([0, 1, 2, 254, 255]);
  });
});
