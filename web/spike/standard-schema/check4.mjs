// P0 — verify the COMPOSITE v4 patterns the domain port needs (row codec + graph projection).
import * as EffectMod from "effect";
const { Schema, SchemaTransformation, SchemaGetter } = EffectMod;

const out = [];
const check = (name, fn) => {
  try { out.push([name, "PASS", String(fn())]); }
  catch (e) { out.push([name, "FAIL", e?.message ?? String(e)]); }
};

const DriveItemId = Schema.String.pipe(Schema.brand("DriveItemId"));
const Location = Schema.Struct({ latitude: Schema.Number, longitude: Schema.Number });
const Description = Schema.NonEmptyString;
const ReviewStatus = Schema.Literal("needs_review", "handled", "skipped");

check("check(isBetween) refinement", () => {
  const Lat = Schema.Number.pipe(Schema.check(Schema.isBetween(-90, 90)));
  const ok = Schema.decodeUnknownSync(Lat)(50);
  let threw = false;
  try { Schema.decodeUnknownSync(Lat)(200); } catch { threw = true; }
  return `ok=${ok} rejects200=${threw}`;
});

check("NonEmptyString rejects empty", () => {
  let threw = false;
  try { Schema.decodeUnknownSync(Schema.NonEmptyString)(""); } catch { threw = true; }
  return `rejectsEmpty=${threw}`;
});

check("PhotoFromRow shape: NullOr + fromJsonString + encodeKeys", () => {
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

  const rowFull = { id: "p1", name: "a.jpg", year: 2019, description: "hi",
    location: '{"latitude":50,"longitude":14}', folder_id: "f1", mime_type: "image/jpeg", review_status: "needs_review" };
  const rowNulls = { id: "p2", name: "b.jpg", year: null, description: null,
    location: null, folder_id: "f1", mime_type: "image/jpeg", review_status: "skipped" };

  const a = Schema.decodeUnknownSync(PhotoFromRow)(rowFull);
  const b = Schema.decodeUnknownSync(PhotoFromRow)(rowNulls);
  const enc = Schema.encodeSync(PhotoFromRow)(a); // back to row (snake keys, JSON string)
  return `full.loc=${JSON.stringify(a.location)} nulls.desc=${b.description} enc.keys=${Object.keys(enc).sort().join(",")} enc.location=${JSON.stringify(enc.location)}`;
});

check("PhotoFromGraphItem shape: nested encodeKeys + decodeTo flatten + forbidden encode", () => {
  // year mapper: path string -> Int|null
  const YearFromPath = Schema.String.pipe(
    Schema.decodeTo(Schema.NullOr(Schema.Int), SchemaTransformation.transform({
      decode: (path) => { const s = path.split("/").find((x) => /^(19|20)\d{2}$/.test(x)); return s ? Number(s) : null; },
      encode: () => "",
    })),
  );
  const PhotoSource = Schema.Struct({
    id: DriveItemId,
    name: Schema.String,
    parentReference: Schema.Struct({ folderId: DriveItemId, year: YearFromPath })
      .pipe(Schema.encodeKeys({ folderId: "id", year: "path" })),
  });
  const Photo = Schema.Struct({ id: DriveItemId, name: Schema.String, folderId: DriveItemId, year: Schema.NullOr(Schema.Int) });
  const PhotoFromGraphItem = PhotoSource.pipe(
    Schema.decodeTo(Photo, {
      decode: SchemaGetter.transform(({ parentReference, ...rest }) => ({
        ...rest, folderId: parentReference.folderId, year: parentReference.year,
      })),
      encode: SchemaGetter.forbidden(() => "Graph ingest is decode-only"),
    }),
  );
  const item = { id: "p1", name: "a.jpg", parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" } };
  const dec = Schema.decodeUnknownSync(PhotoFromGraphItem)(item);
  let encThrew = false;
  try { Schema.encodeSync(PhotoFromGraphItem)(dec); } catch { encThrew = true; }
  return `decoded=${JSON.stringify(dec)} encodeForbidden=${encThrew}`;
});

console.log("RESULTS:");
for (const [n, s, d] of out) console.log(`  [${s}] ${n}${d ? ` — ${d}` : ""}`);
const failed = out.filter((r) => r[1] === "FAIL");
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
