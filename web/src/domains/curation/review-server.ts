import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import { DbRuntime } from "#/db/client.ts";
import { reviewStatuses, setReviewStatus as persistStatus } from "#/db/local-review.ts";
import { ReviewStatus } from "#/domains/shared/photo.ts";

/**
 * The server seam for local review-status (ADR-0019). `/curate` is client-only, but
 * the review bookkeeping lives in D1 — so persistence goes through TanStack server
 * functions (the handler bodies, with the `DbRuntime`/`cloudflare:workers` binding,
 * are stripped from the client bundle). Effects run on the shared `DbRuntime` (the
 * D1 layer is built once, not re-provided per request). The photo metadata itself
 * is written into the file by `PhotoSource.write`; only the status is persisted
 * here, keyed by the photo's local path.
 */

const SetInput = Schema.Struct({ path: Schema.String, status: ReviewStatus });
const decodeSetInput = Schema.decodeUnknownSync(SetInput);

/** Persist a photo's review status (needs_review / handled / skipped), keyed by local path. */
export const setReviewStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decodeSetInput(data))
  .handler(({ data }) => DbRuntime.runPromise(persistStatus(data.path, data.status)));

/** Every recorded review status — to hydrate the crawled photos with their D1 state. */
export const fetchReviewStatuses = createServerFn().handler(() =>
  DbRuntime.runPromise(reviewStatuses()),
);
