// P0 spike #2, Part A — @effect/sql-d1 + the ported PhotoFromRow codec against a REAL (miniflare) D1.
// Verifies: SqlClient layer from a D1 binding, tagged-template queries, and that the v4 row codec
// (NullOr + fromJsonString + encodeKeys) decodes real D1 rows incl. NULLs.
import { Miniflare } from "miniflare";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { D1Client } from "@effect/sql-d1";

// --- domain schema, copied verbatim from domain-model.md §2/§4 (verified v4) ---
const DriveItemId = Schema.String.pipe(Schema.brand("DriveItemId"));
const Location = Schema.Struct({
  latitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -90, maximum: 90 }))),
  longitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -180, maximum: 180 }))),
  altitude: Schema.optionalKey(Schema.Number),
});
const Description = Schema.NonEmptyString;
const ReviewStatus = Schema.Literals(["needs_review", "handled", "skipped"]);
const PhotoFromRow = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  year: Schema.NullOr(Schema.Int),
  description: Schema.NullOr(Description),
  location: Schema.NullOr(Schema.fromJsonString(Location)),
  folderId: DriveItemId,
  mimeType: Schema.String,
  reviewStatus: ReviewStatus,
}).pipe(Schema.encodeKeys({ folderId: "folder_id", mimeType: "mime_type", reviewStatus: "review_status" }));

const mf = new Miniflare({
  modules: true,
  script: "export default {};",
  compatibilityDate: "2025-09-02",
  d1Databases: { DB: "spike" },
});

try {
  const db = await mf.getD1Database("DB");

  const program = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE photo_index (
      id TEXT PRIMARY KEY, name TEXT, folder_id TEXT, year INTEGER,
      mime_type TEXT, description TEXT, location TEXT, review_status TEXT
    )`;
    yield* sql`INSERT INTO photo_index (id,name,folder_id,year,mime_type,description,location,review_status)
      VALUES (${"p1"},${"a.jpg"},${"f1"},${2019},${"image/jpeg"},${"Holiday"},${'{"latitude":50,"longitude":14}'},${"needs_review"})`;
    yield* sql`INSERT INTO photo_index (id,name,folder_id,year,mime_type,description,location,review_status)
      VALUES (${"p2"},${"b.png"},${"f1"},${null},${"image/png"},${null},${null},${"skipped"})`;
    // review-queue query: photos missing a description
    const missing = yield* sql`SELECT id FROM photo_index WHERE description IS NULL`;
    const rows = yield* sql`SELECT * FROM photo_index ORDER BY id`;
    return { rows, missing };
  });

  const { rows, missing } = await Effect.runPromise(program.pipe(Effect.provide(D1Client.layer({ db }))));
  console.log("raw rows:", JSON.stringify(rows));
  const decoded = rows.map((r) => Schema.decodeUnknownSync(PhotoFromRow)(r));
  console.log("decoded:", JSON.stringify(decoded, null, 2));

  const p1 = decoded.find((d) => d.id === "p1");
  const p2 = decoded.find((d) => d.id === "p2");
  const ok =
    p1.year === 2019 && p1.description === "Holiday" && p1.location.latitude === 50 &&
    p2.year === null && p2.description === null && p2.location === null &&
    missing.length === 1 && missing[0].id === "p2";

  console.log(`\nreview-queue (description IS NULL): ${JSON.stringify(missing)}`);
  console.log(ok ? "\nPASS: @effect/sql-d1 + PhotoFromRow round-trip against real D1" : "\nFAIL: assertions");
  await mf.dispose();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("FAIL:", e);
  await mf.dispose();
  process.exit(1);
}
