// Smoke-verify the lifted v4 domain schemas decode/encode against the project's
// installed effect. Run: bun scripts/verify-domain.ts
import { Schema } from "effect";
import {
  GraphDriveItem,
  Orientation,
  Photo,
  PhotoFromGraphItem,
  ReviewStatus,
  WriteJob,
  WritePayload,
} from "#/domain/index.ts";
import { GraphRequestError } from "#/domain/errors.ts";

const out: Array<[string, "PASS" | "FAIL", string]> = [];
const check = (name: string, fn: () => unknown) => {
  try {
    out.push([name, "PASS", String(fn())]);
  } catch (e) {
    out.push([name, "FAIL", (e as Error)?.message ?? String(e)]);
  }
};

check("Photo decode", () => {
  const p = Schema.decodeUnknownSync(Photo)({
    id: "p1", name: "a.jpg", folderId: "f1", year: 2019, mimeType: "image/jpeg",
    description: "Holiday", location: { latitude: 50, longitude: 14 }, reviewStatus: "needs_review",
  });
  return `${p.id} year=${p.year} loc=${p.location?.latitude}`;
});

check("Photo decode with nulls", () => {
  const p = Schema.decodeUnknownSync(Photo)({
    id: "p2", name: "b.png", folderId: "f1", year: null, mimeType: "image/png",
    description: null, location: null, reviewStatus: "skipped",
  });
  return `desc=${p.description} loc=${p.location} year=${p.year}`;
});

check("ReviewStatus + Orientation Literals", () => {
  return `${Schema.decodeUnknownSync(ReviewStatus)("handled")} / ${Schema.decodeUnknownSync(Orientation)(6)}`;
});

check("GraphDriveItem decode (ISO date)", () => {
  const it = Schema.decodeUnknownSync(GraphDriveItem)({
    id: "p1", name: "a.jpg", lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
    file: { mimeType: "image/jpeg" }, description: "hi", location: { latitude: 50, longitude: 14 },
  });
  return `mtime=${String(it.lastModifiedDateTime)}`;
});

check("PhotoFromGraphItem — full item", () => {
  const p = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p1", name: "a.jpg", lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
    file: { mimeType: "image/jpeg" }, description: "Holiday", location: { latitude: 50, longitude: 14 },
  });
  return JSON.stringify(p);
});

check("PhotoFromGraphItem — ABSENT description/location/file keys (the flagged case)", () => {
  const p = Schema.decodeUnknownSync(PhotoFromGraphItem)({
    id: "p2", name: "b.png", lastModifiedDateTime: "2020-01-01T00:00:00Z",
    parentReference: { id: "f1", path: "/drive/root:/Fam/scans/old" }, // no year folder
  });
  return `year=${p.year} desc=${p.description} loc=${p.location} mime=${p.mimeType} status=${p.reviewStatus}`;
});

check("WritePayload — description", () =>
  JSON.stringify(Schema.decodeUnknownSync(WritePayload)({ kind: "description", text: "hoi" })));

check("WritePayload — location_orientation", () =>
  JSON.stringify(Schema.decodeUnknownSync(WritePayload)({ kind: "location_orientation", location: { latitude: 1, longitude: 2 }, orientation: 6 })));

check("WriteJob decode", () =>
  JSON.stringify(Schema.decodeUnknownSync(WriteJob)({
    photoId: "p1", payload: { kind: "description", text: "x" }, status: "pending", attempts: 0,
    workflowInstanceId: null, error: null,
  })));

check("TaggedErrorClass", () => {
  const e = new GraphRequestError({ status: 429, retryAfter: 5 });
  return `_tag=${e._tag} status=${e.status} isError=${e instanceof Error}`;
});

console.log("DOMAIN VERIFY:");
for (const [n, s, d] of out) console.log(`  [${s}] ${n}${d ? ` — ${d}` : ""}`);
const failed = out.filter((r) => r[1] === "FAIL");
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
