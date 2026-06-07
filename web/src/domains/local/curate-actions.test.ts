import { describe, expect, it } from "@effect/vitest";
import { DriveItemId } from "#/domains/shared/ids.ts";
import { mergeReviewStatuses } from "./curate-actions.ts";

describe("mergeReviewStatuses", () => {
  const photos = [
    { id: DriveItemId.make("a/lake.jpg"), reviewStatus: "needs_review" as const },
    { id: DriveItemId.make("a/beach.jpg"), reviewStatus: "needs_review" as const },
  ];

  it("overlays recorded D1 statuses on the crawl defaults", () => {
    const merged = mergeReviewStatuses(photos, [{ path: "a/lake.jpg", reviewStatus: "handled" }]);
    expect(merged.get(DriveItemId.make("a/lake.jpg"))).toBe("handled"); // from D1
    expect(merged.get(DriveItemId.make("a/beach.jpg"))).toBe("needs_review"); // default
  });

  it("ignores records for photos not in the crawl", () => {
    const merged = mergeReviewStatuses(photos, [{ path: "a/ghost.jpg", reviewStatus: "skipped" }]);
    expect(merged.has(DriveItemId.make("a/ghost.jpg"))).toBe(false);
    expect(merged.size).toBe(2);
  });
});
