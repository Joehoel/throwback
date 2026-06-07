import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import { PhotoFromLocalFile } from "./mapper.ts";

describe("PhotoFromLocalFile", () => {
  it("projects a crawled local file onto a Photo that needs review", () => {
    const photo = Schema.decodeUnknownSync(PhotoFromLocalFile)({
      id: "Root/a.jpg",
      name: "a.jpg",
      folderId: "Root",
      mimeType: "image/jpeg",
      year: 2019,
      description: "Hoi",
      location: { latitude: 52.1, longitude: 5.2 },
    });
    expect(photo.reviewStatus).toBe("needs_review");
    expect(photo.year).toBe(2019);
    expect(photo.description).toBe("Hoi");
    expect(photo.location?.latitude).toBe(52.1);
  });

  it("keeps missing metadata as null", () => {
    const photo = Schema.decodeUnknownSync(PhotoFromLocalFile)({
      id: "Root/b.png",
      name: "b.png",
      folderId: "Root",
      mimeType: "image/png",
      year: null,
      description: null,
      location: null,
    });
    expect(photo.year).toBeNull();
    expect(photo.description).toBeNull();
    expect(photo.location).toBeNull();
  });

  it("is decode-only — encoding is forbidden", () => {
    const photo: Photo = {
      id: DriveItemId.make("Root/a.jpg"),
      name: "a.jpg",
      folderId: DriveItemId.make("Root"),
      year: 2019,
      mimeType: "image/jpeg",
      description: "Hoi",
      location: { latitude: 52.1, longitude: 5.2 },
      reviewStatus: "needs_review",
    };
    expect(() => Schema.encodeSync(PhotoFromLocalFile)(photo)).toThrow();
  });
});
