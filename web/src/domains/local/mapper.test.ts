import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { PhotoFromLocalFile } from "./mapper.ts";

const decode = Schema.decodeUnknownSync(PhotoFromLocalFile);

describe("PhotoFromLocalFile", () => {
  it("derives id/folder from the path and needs review", () => {
    const photo = decode({
      name: "a.jpg",
      pathSegments: ["Vakantie", "2019"],
      mimeType: "image/jpeg",
      exifYear: 2021,
      description: "Hoi",
      location: { latitude: 52.1, longitude: 5.2 },
    });

    expect(photo.id).toBe("Vakantie/2019/a.jpg");
    expect(photo.folderId).toBe("Vakantie/2019");
    expect(photo.reviewStatus).toBe("needs_review");
    expect(photo.year).toBe(2019); // path year wins over EXIF 2021
    expect(photo.description).toBe("Hoi");
    expect(photo.location?.latitude).toBe(52.1);
  });

  it("falls back to the EXIF year when no year folder is in the path", () => {
    const photo = decode({
      name: "b.jpg",
      pathSegments: ["Album"],
      mimeType: "image/jpeg",
      exifYear: 2018,
      description: null,
      location: null,
    });

    expect(photo.year).toBe(2018);
    expect(photo.description).toBeNull();
    expect(photo.location).toBeNull();
  });

  it("leaves year null when neither path nor EXIF has one", () => {
    const photo = decode({
      name: "c.png",
      pathSegments: ["Album"],
      mimeType: "image/png",
      exifYear: null,
      description: null,
      location: null,
    });

    expect(photo.year).toBeNull();
  });

  it("is decode-only — encoding is forbidden", () => {
    const photo = decode({
      name: "a.jpg",
      pathSegments: ["Root"],
      mimeType: "image/jpeg",
      exifYear: 2019,
      description: "Hoi",
      location: null,
    });

    expect(() => Schema.encodeSync(PhotoFromLocalFile)(photo)).toThrow();
  });
});
