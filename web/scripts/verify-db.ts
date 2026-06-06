// P3 verify — the @effect/sql-d1 repos + migrations against a real (miniflare) D1.
// Applies drizzle/0001+0002, then exercises photo-index & write-queue repos.
// Run: bun scripts/verify-db.ts
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Effect, Schema } from "effect";
import { D1Client } from "@effect/sql-d1";
import * as PhotoIndex from "#/db/photo-index.ts";
import * as WriteQueue from "#/db/write-queue.ts";
import { PhotoFromGraphItem } from "#/domain/graph.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default {};",
  compatibilityDate: "2025-09-02",
  d1Databases: { DB: "verify" },
});

const out: Array<[string, boolean, string]> = [];
const ok = (name: string, cond: boolean, detail = "") => out.push([name, cond, detail]);

try {
  const db = await mf.getD1Database("DB");

  // apply app migrations (strip --comment lines, split on ;)
  for (const file of ["drizzle/0001_photo_index.sql", "drizzle/0002_write_jobs.sql"]) {
    const body = readFileSync(file, "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const stmt of body.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }

  // two crawled photos: one fully populated, one missing description + location
  const full = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p1", name: "a.jpg", lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
    file: { mimeType: "image/jpeg" }, description: "Holiday", location: { latitude: 50, longitude: 14 },
  });
  const bare = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p2", name: "b.png", lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" }, file: { mimeType: "image/png" },
  });

  const program = Effect.gen(function* () {
    yield* PhotoIndex.upsert(full);
    yield* PhotoIndex.upsert(bare);

    const needsDesc = yield* PhotoIndex.reviewNext("missing_description");
    ok("reviewNext(missing_description) -> p2", needsDesc?.id === "p2", `got ${needsDesc?.id}`);

    const needsLoc = yield* PhotoIndex.reviewNext("missing_location");
    ok("reviewNext(missing_location) -> p2", needsLoc?.id === "p2", `got ${needsLoc?.id}`);

    // p1 round-trips content (JSON location parsed back)
    const p1 = yield* PhotoIndex.reviewNext("any");
    ok("p1 location round-trips", p1?.location?.latitude === 50, JSON.stringify(p1?.location));

    // re-crawl preserves review_status: skip p2, re-upsert, still skipped
    yield* PhotoIndex.setReviewStatus(bare.id, "skipped");
    yield* PhotoIndex.upsert(bare);
    const afterRecrawl = yield* PhotoIndex.reviewNext("missing_description");
    ok("re-crawl preserves skipped (no p2 in queue)", afterRecrawl === null || afterRecrawl.id !== "p2", `got ${afterRecrawl?.id}`);

    // write queue: enqueue a description write, read pending, complete it
    yield* WriteQueue.enqueue({
      photoId: "p1", payload: { kind: "description", text: "Een dierbaar moment" },
      status: "pending", attempts: 0, workflowInstanceId: null, error: null,
    });
    const pend = yield* WriteQueue.pending;
    ok("write-queue pending -> 1 job", pend.length === 1 && pend[0]?.photoId === "p1", `len=${pend.length}`);
    ok("payload JSON round-trips", pend[0]?.payload.kind === "description", JSON.stringify(pend[0]?.payload));

    yield* WriteQueue.setStatus("p1", "succeeded");
    const pend2 = yield* WriteQueue.pending;
    ok("after succeeded -> 0 pending", pend2.length === 0, `len=${pend2.length}`);
    const job = yield* WriteQueue.get("p1");
    ok("get(p1).status = succeeded", job?.status === "succeeded", `got ${job?.status}`);
  });

  await Effect.runPromise(program.pipe(Effect.provide(D1Client.layer({ db }))));
} catch (e) {
  ok("program ran", false, (e as Error)?.message ?? String(e));
}

await mf.dispose();
console.log("DB VERIFY:");
for (const [n, pass, d] of out) console.log(`  [${pass ? "PASS" : "FAIL"}] ${n}${d && !pass ? ` — ${d}` : ""}`);
const failed = out.filter((r) => !r[1]);
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
