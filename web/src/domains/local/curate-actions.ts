import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { ReviewStatus } from "#/domains/shared/photo.ts";

/**
 * Pure helpers for the local curation flow. The crawl gives every photo a default
 * review status; D1 holds the persisted truth (ADR-0019), keyed by the photo's
 * local path (which *is* its `DriveItemId` here). Merging is the only logic worth
 * isolating from the React wiring.
 */

/** A persisted review record from D1 (`review-server.fetchReviewStatuses`). */
export interface ReviewRecord {
  readonly path: string;
  readonly reviewStatus: ReviewStatus;
}

interface Reviewable {
  readonly id: DriveItemId;
  readonly reviewStatus: ReviewStatus;
}

/** Overlay the D1-recorded statuses on the crawl defaults, keyed by photo id (= path). */
export const mergeReviewStatuses = (
  photos: readonly Reviewable[],
  recorded: readonly ReviewRecord[],
): ReadonlyMap<DriveItemId, ReviewStatus> => {
  const byPath = new Map(recorded.map((record) => [record.path, record.reviewStatus]));
  return new Map(photos.map((photo) => [photo.id, byPath.get(photo.id) ?? photo.reviewStatus]));
};
