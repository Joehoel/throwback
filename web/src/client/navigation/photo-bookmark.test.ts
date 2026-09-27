import { describe, expect, it } from "vitest";
import { parsePhotoBookmark } from "./photo-bookmark.ts";

describe("Foto bookmark ids", () => {
  it("parses every nominal id through the generated contract", () => {
    expect(
      parsePhotoBookmark({
        libraryId: "00000000-0000-4000-8000-000000000046",
        eventId: "event-a",
        photoId: "photo-a",
      }),
    ).toEqual({
      libraryId: "00000000-0000-4000-8000-000000000046",
      eventId: "event-a",
      photoId: "photo-a",
    });
  });

  it("rejects a malformed resource id before any request", () => {
    expect(
      parsePhotoBookmark({
        libraryId: "not-a-library-id",
        eventId: "event-a",
        photoId: "photo-a",
      }),
    ).toBeNull();
  });
});
