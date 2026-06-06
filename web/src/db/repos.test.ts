import { D1Client } from "@effect/sql-d1";
import { applyD1Migrations, env } from "cloudflare:test";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import { beforeAll, expect, it } from "vitest";
import * as PhotoIndex from "#/db/photo-index.ts";
import * as WriteQueue from "#/db/write-queue.ts";
import { PhotoFromGraphItem } from "#/domain/graph.ts";

/**
 * Photo-index + write-queue repos against a real (workerd/Miniflare) D1 — migrated
 * from the former `scripts/verify-db.ts`, now in the `@cloudflare/vitest-pool-workers`
 * `d1` project. The app's drizzle migrations (0001/0002) are applied from the
 * `TEST_MIGRATIONS` binding wired in vitest.config.ts. Exercises the @effect/sql-d1
 * repos: review-queue predicates, JSON round-trips, re-crawl status preservation,
 * and the write-queue lifecycle (ADR-0009/0011, domain-model.md §4–5).
 */

// `TEST_MIGRATIONS` is a test-only binding (see vitest.config.ts); not in the app's Env.
const migrations = (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] })
  .TEST_MIGRATIONS;

beforeAll(async () => {
  await applyD1Migrations(env.DB, migrations);
});

const run = <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(program.pipe(Effect.provide(D1Client.layer({ db: env.DB }))));

it("photo-index + write-queue round-trip against D1", async () => {
  // Two crawled photos: one fully populated, one missing description + location.
  const full = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p1",
    name: "a.jpg",
    lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
    file: { mimeType: "image/jpeg" },
    description: "Holiday",
    location: { latitude: 50, longitude: 14 },
  });
  const bare = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p2",
    name: "b.png",
    lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
    file: { mimeType: "image/png" },
  });

  await run(
    Effect.gen(function* () {
      yield* PhotoIndex.upsert(full);
      yield* PhotoIndex.upsert(bare);

      // The review queue surfaces the photo missing a description / location.
      const needsDesc = yield* PhotoIndex.reviewNext("missing_description");
      expect(needsDesc?.id).toBe("p2");
      const needsLoc = yield* PhotoIndex.reviewNext("missing_location");
      expect(needsLoc?.id).toBe("p2");

      // p1's JSON location column round-trips back to a Location.
      const p1 = yield* PhotoIndex.reviewNext("any");
      expect(p1?.location?.latitude).toBe(50);

      // Re-crawl preserves review_status: skip p2, re-upsert, still skipped (off the queue).
      yield* PhotoIndex.setReviewStatus(bare.id, "skipped");
      yield* PhotoIndex.upsert(bare);
      const afterRecrawl = yield* PhotoIndex.reviewNext("missing_description");
      expect(afterRecrawl?.id).not.toBe("p2");

      // Write queue: enqueue a description write, read it pending, complete it.
      yield* WriteQueue.enqueue({
        photoId: full.id,
        payload: { kind: "description", text: "Een dierbaar moment" },
        status: "pending",
        attempts: 0,
        workflowInstanceId: null,
        error: null,
      });
      const pend = yield* WriteQueue.pending;
      expect(pend).toHaveLength(1);
      expect(pend[0]?.photoId).toBe("p1");
      expect(pend[0]?.payload.kind).toBe("description");

      yield* WriteQueue.setStatus(full.id, "succeeded");
      const pend2 = yield* WriteQueue.pending;
      expect(pend2).toHaveLength(0);
      const job = yield* WriteQueue.get(full.id);
      expect(job?.status).toBe("succeeded");
    }),
  );
});
