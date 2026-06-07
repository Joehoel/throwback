import { D1Client } from "@effect/sql-d1";
import { applyD1Migrations, env } from "cloudflare:test";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import { beforeAll, expect, it } from "vitest";
import * as Review from "#/db/local-review.ts";

/**
 * Local review-status repo against a real (workerd/Miniflare) D1 (ADR-0019). The
 * app's drizzle migrations are applied from the `TEST_MIGRATIONS` binding wired in
 * vitest.config.ts. Exercises the default, upsert, and the hydrate-all query.
 */

const migrations = (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] })
  .TEST_MIGRATIONS;

beforeAll(async () => {
  await applyD1Migrations(env.DB, migrations);
});

const run = <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(program.pipe(Effect.provide(D1Client.layer({ db: env.DB }))));

it("defaults to needs_review, upserts, and lists recorded statuses", async () => {
  await run(
    Effect.gen(function* () {
      const path = "Vakantie/2019/lake.jpg";

      // Unrecorded paths default to needs_review.
      expect(yield* Review.getReviewStatus(path)).toBe("needs_review");

      // Set, then read back; a second set on the same path updates (no duplicate).
      yield* Review.setReviewStatus(path, "handled");
      expect(yield* Review.getReviewStatus(path)).toBe("handled");
      yield* Review.setReviewStatus(path, "skipped");
      expect(yield* Review.getReviewStatus(path)).toBe("skipped");

      yield* Review.setReviewStatus("Vakantie/beach.jpg", "handled");
      const all = yield* Review.reviewStatuses();
      expect(all).toHaveLength(2);
      expect(all.find((row) => row.path === path)?.reviewStatus).toBe("skipped");
    }),
  );
});
