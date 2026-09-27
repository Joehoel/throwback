import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { makeIndexDatabase } from "../library/library-index-test-support.ts";
import { executePhotoTracer } from "./photo-tracer-test-support.ts";

describe("first real Foto tracer", () => {
  it("selects the Hoofdmap, reports progress, activates, and opens an authenticated JPEG", async () => {
    const result = await executePhotoTracer(makeIndexDatabase({ seedLibrary: false }));

    expect(result.selection.progress).toMatchObject({ status: "queued", reviewBlocked: true });
    expect(result.engine.enumerated).toBe("continue");
    expect(result.engine.stagedProgress).toEqual(
      Option.some({
        status: "running",
        pagesProcessed: 1,
        processedItems: 6,
        reviewBlocked: true,
      }),
    );
    expect(result.engine.hiddenPhoto).toEqual(Option.none());
    expect(result.engine.skippedNonJpeg).toBe("continue");
    expect(result.engine.hydratedJpeg).toBe("continue");
    expect(result.engine.activated).toBe("complete");
    expect(result.engine.activeProgress).toEqual(
      Option.some({
        status: "active",
        pagesProcessed: 1,
        processedItems: 6,
        reviewBlocked: false,
      }),
    );
    expect(result.opened.photo).toMatchObject({
      photoId: "photo-a",
      eventId: "event-a",
      fileName: "familie.jpg",
      description: "Oud café",
      orientation: 6,
      cTag: "ctag-a",
      eTag: "etag-a",
      projectionRevision: 1,
    });
    expect(result.opened.photo.location?.latitude).toBeCloseTo(52.1, 6);
    expect([...result.opened.preview].reduce((bytes, chunk) => bytes + chunk.length, 0)).toBe(2216);
  });
});
