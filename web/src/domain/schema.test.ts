import { Schema } from "effect";
import { describe, expect, it } from "vitest";
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

/**
 * Domain schema codecs (ADR-0012/0013) — the single contract source. Migrated
 * from the former `scripts/verify-domain.ts`. These assert the lifted Effect v4
 * schemas decode/encode the shapes the crawl and the D1 codecs rely on, with the
 * "absent Graph key → null" projection (domain-model.md §2–3) pinned down.
 */

describe("Photo", () => {
  it("decodes a fully-populated photo", () => {
    const p = Schema.decodeUnknownSync(Photo)({
      id: "p1",
      name: "a.jpg",
      folderId: "f1",
      year: 2019,
      mimeType: "image/jpeg",
      description: "Holiday",
      location: { latitude: 50, longitude: 14 },
      reviewStatus: "needs_review",
    });
    expect(p.id).toBe("p1");
    expect(p.year).toBe(2019);
    expect(p.location?.latitude).toBe(50);
  });

  it("decodes nulls for the missing fields", () => {
    const p = Schema.decodeUnknownSync(Photo)({
      id: "p2",
      name: "b.png",
      folderId: "f1",
      year: null,
      mimeType: "image/png",
      description: null,
      location: null,
      reviewStatus: "skipped",
    });
    expect(p.description).toBeNull();
    expect(p.location).toBeNull();
    expect(p.year).toBeNull();
  });
});

describe("literals", () => {
  it("decodes ReviewStatus and Orientation", () => {
    expect(Schema.decodeUnknownSync(ReviewStatus)("handled")).toBe("handled");
    expect(Schema.decodeUnknownSync(Orientation)(6)).toBe(6);
  });
});

describe("GraphDriveItem", () => {
  it("decodes the ISO lastModifiedDateTime to a DateTime", () => {
    const it_ = Schema.decodeUnknownSync(GraphDriveItem)({
      id: "p1",
      name: "a.jpg",
      lastModifiedDateTime: "2020-01-01T00:00:00Z",
      parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
      file: { mimeType: "image/jpeg" },
      description: "hi",
      location: { latitude: 50, longitude: 14 },
    });
    expect(String(it_.lastModifiedDateTime)).toContain("2020-01-01");
  });
});

describe("PhotoFromGraphItem", () => {
  it("projects a full Graph item onto a Photo", () => {
    const p = Schema.decodeUnknownSync(PhotoFromGraphItem)({
      id: "p1",
      name: "a.jpg",
      lastModifiedDateTime: "2020-01-01T00:00:00Z",
      parentReference: { id: "f1", path: "/drive/root:/Fam/2019/06/Trip" },
      file: { mimeType: "image/jpeg" },
      description: "Holiday",
      location: { latitude: 50, longitude: 14 },
    });
    expect(p.folderId).toBe("f1");
    expect(p.year).toBe(2019);
    expect(p.description).toBe("Holiday");
    expect(p.reviewStatus).toBe("needs_review");
  });

  it("turns absent description/location/file/year keys into the domain defaults", () => {
    // The flagged case: Graph omits the keys entirely (no year folder in the path).
    const p = Schema.decodeUnknownSync(PhotoFromGraphItem)({
      id: "p2",
      name: "b.png",
      lastModifiedDateTime: "2020-01-01T00:00:00Z",
      parentReference: { id: "f1", path: "/drive/root:/Fam/scans/old" },
    });
    expect(p.year).toBeNull();
    expect(p.description).toBeNull();
    expect(p.location).toBeNull();
    expect(p.mimeType).toBe("application/octet-stream");
    expect(p.reviewStatus).toBe("needs_review");
  });
});

describe("WritePayload / WriteJob", () => {
  it("decodes a description payload", () => {
    const payload = Schema.decodeUnknownSync(WritePayload)({ kind: "description", text: "hoi" });
    expect(payload).toEqual({ kind: "description", text: "hoi" });
  });

  it("decodes a location_orientation payload", () => {
    const payload = Schema.decodeUnknownSync(WritePayload)({
      kind: "location_orientation",
      location: { latitude: 1, longitude: 2 },
      orientation: 6,
    });
    expect(payload).toMatchObject({ kind: "location_orientation", orientation: 6 });
  });

  it("decodes a WriteJob", () => {
    const job = Schema.decodeUnknownSync(WriteJob)({
      photoId: "p1",
      payload: { kind: "description", text: "x" },
      status: "pending",
      attempts: 0,
      workflowInstanceId: null,
      error: null,
    });
    expect(job.photoId).toBe("p1");
    expect(job.status).toBe("pending");
  });
});

describe("tagged errors", () => {
  it("GraphRequestError is a real Error carrying its tag + fields", () => {
    const e = new GraphRequestError({ status: 429, retryAfter: 5 });
    expect(e._tag).toBe("GraphRequestError");
    expect(e.status).toBe(429);
    expect(e).toBeInstanceOf(Error);
  });
});
