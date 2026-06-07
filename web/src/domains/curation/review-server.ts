import { createServerFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";
import { SqlLive } from "#/db/client.ts";
import { reviewStatuses, setReviewStatus as persistStatus } from "#/db/local-review.ts";
import { ReviewStatus } from "#/domains/shared/photo.ts";

/**
 * The server seam for local review-status (ADR-0019). `/curate` is client-only, but
 * the review bookkeeping lives in D1 — so persistence goes through TanStack server
 * functions (the handler bodies, with the `SqlLive`/`cloudflare:workers` binding,
 * are stripped from the client bundle). The photo metadata itself is written into
 * the file by `PhotoSource.write`; only the status is persisted here, keyed by the
 * photo's local path.
 */

const SetInput = Schema.Struct({ path: Schema.String, status: ReviewStatus });
const decodeSetInput = Schema.decodeUnknownSync(SetInput);

/** Persist a photo's review status (needs_review / handled / skipped), keyed by local path. */
export const setReviewStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decodeSetInput(data))
  .handler(({ data }) =>
    Effect.runPromise(persistStatus(data.path, data.status).pipe(Effect.provide(SqlLive))),
  );

/** Every recorded review status — to hydrate the crawled photos with their D1 state. */
export const fetchReviewStatuses = createServerFn().handler(() =>
  Effect.runPromise(reviewStatuses().pipe(Effect.provide(SqlLive))),
);
