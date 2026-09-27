import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { JpegSourceChanged } from "./errors.ts";
import { prepareJpegTransform, inspectJpeg, verifyJpeg } from "./jpeg-codec.ts";
import type { PhotoMetadataTarget, ReplayableJpeg } from "./model.ts";

const fixtureDirectory = fileURLToPath(new URL("fixtures/", import.meta.url));

function sourceFromBytes(bytes: Uint8Array): ReplayableJpeg {
  return {
    open: () =>
      Effect.succeed(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 37) {
              controller.enqueue(bytes.slice(offset, Math.min(offset + 37, bytes.length)));
            }

            controller.close();
          },
        }),
      ),
  };
}

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(`${fixtureDirectory}/${name}`));
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();

  while (true) {
    const result = await reader.read();

    if (result.done) break;
    parts.push(result.value);
    length += result.value.length;
  }

  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
    const matches = needle.every((byte, index) => haystack[offset + index] === byte);

    if (matches) {
      return offset;
    }
  }

  return -1;
}

async function transform(name: string, target: PhotoMetadataTarget): Promise<Uint8Array> {
  const source = sourceFromBytes(await fixture(name));
  const prepared = await Effect.runPromise(prepareJpegTransform(source, target));
  const output = await collect(await Effect.runPromise(prepared.open()));
  expect(output).toHaveLength(prepared.byteLength);
  await Effect.runPromise(
    verifyJpeg(sourceFromBytes(output), target, { sourceManifest: prepared.sourceManifest }),
  );

  return output;
}

describe("bounded streaming JPEG codec", () => {
  it("recognizes baseline and progressive scan structures", async () => {
    const baseline = await Effect.runPromise(
      inspectJpeg(sourceFromBytes(await fixture("baseline-minimal.jpg"))),
    );

    const progressive = await Effect.runPromise(
      inspectJpeg(sourceFromBytes(await fixture("progressive-minimal.jpg"))),
    );

    expect(baseline.manifest.scanCount).toBe(1);
    expect(progressive.manifest.scanCount).toBeGreaterThan(1);
    expect(baseline.metadata).toEqual({ description: null, location: null, orientation: 1 });
  });

  it("rereads little- and big-endian EXIF with thumbnail, Interop, and MakerNote", async () => {
    const little = await Effect.runPromise(
      inspectJpeg(sourceFromBytes(await fixture("little-endian-rich.jpg"))),
    );

    const big = await Effect.runPromise(
      inspectJpeg(sourceFromBytes(await fixture("big-endian-rich.jpg"))),
    );

    expect(little.metadata.description).toBe("Oud café");
    expect(little.metadata.orientation).toBe(6);
    expect(little.metadata.location?.latitude).toBeCloseTo(52.1, 6);
    expect(big.metadata).toMatchObject({ description: "Groot endian", orientation: 2 });
    expect(big.metadata.location?.latitude).toBeCloseTo(-33.86, 6);
  });

  it("sets a complete target and supports every semantic Orientation", async () => {
    const sourceBytes = await fixture("baseline-minimal.jpg");

    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const target = {
        description: "Nieuwe beschrijving – café",
        location: { latitude: 52.0907, longitude: 5.1214 },
        orientation,
      };

      const source = sourceFromBytes(sourceBytes);
      const prepared = await Effect.runPromise(prepareJpegTransform(source, target));
      const output = await collect(await Effect.runPromise(prepared.open()));

      const verified = await Effect.runPromise(
        verifyJpeg(sourceFromBytes(output), target, { sourceManifest: prepared.sourceManifest }),
      );

      expect(verified.metadata.orientation).toBe(orientation);
    }
  });

  it("replaces managed fields while preserving unknown EXIF and JPEG bytes", async () => {
    const output = await transform("replace-source.jpg", {
      description: "Vervangende tekst met accenten: Joël",
      location: { latitude: -41.2866, longitude: 174.7756 },
      orientation: 3,
    });

    expect(output.byteLength).toBeGreaterThan(0);
  });

  it("removes every managed Description and Location mirror explicitly", async () => {
    const output = await transform("remove-source.jpg", {
      description: null,
      location: null,
      orientation: 1,
    });

    const inspected = await Effect.runPromise(inspectJpeg(sourceFromBytes(output)));
    expect(inspected.metadata).toEqual({ description: null, location: null, orientation: 1 });
  });

  it("preserves multipart extended XMP while changing standard XMP", async () => {
    const output = await transform("extended-xmp.jpg", {
      description: "Nieuw standaard XMP",
      location: null,
      orientation: 1,
    });

    expect(output.byteLength).toBeGreaterThan(0);
  });

  it("preserves multipart ICC, unknown APP segments, COM, and scan bytes", async () => {
    const output = await transform("multipart-icc-unknown.jpg", {
      description: "Toegevoegd zonder nevenschade",
      location: { latitude: 0, longitude: 0 },
      orientation: 4,
    });

    expect(output.byteLength).toBeGreaterThan(0);
  });

  it("preserves multiple progressive scans through a rich replacement", async () => {
    const output = await transform("progressive-rich.jpg", {
      description: "Progressief gewijzigd",
      location: { latitude: 64.1466, longitude: -21.9426 },
      orientation: 8,
    });

    expect(output.byteLength).toBeGreaterThan(0);
  });

  it.each(["malformed-truncated.jpg", "malformed-xmp.jpg"])(
    "rejects %s during preflight before output exists",
    async (name) => {
      const result = await Effect.runPromiseExit(
        prepareJpegTransform(sourceFromBytes(await fixture(name)), {
          description: "Nooit uploaden",
          location: null,
          orientation: 1,
        }),
      );

      expect(result._tag).toBe("Failure");
    },
  );

  it("rejects a header beyond the configured bound before preparing output", async () => {
    const result = await Effect.runPromiseExit(
      prepareJpegTransform(
        sourceFromBytes(await fixture("baseline-minimal.jpg")),
        { description: null, location: null, orientation: 1 },
        { maxHeaderBytes: 32 },
      ),
    );

    expect(result._tag).toBe("Failure");
  });

  it("rejects provider output when an unmanaged ICC byte changed", async () => {
    const target: PhotoMetadataTarget = {
      description: "Behoud alle unmanaged bytes",
      location: null,
      orientation: 1,
    };

    const source = sourceFromBytes(await fixture("multipart-icc-unknown.jpg"));
    const prepared = await Effect.runPromise(prepareJpegTransform(source, target));
    const output = await collect(await Effect.runPromise(prepared.open()));

    const iccData = new Uint8Array([
      ...new TextEncoder().encode("ICC_PROFILE\0"),
      1,
      2,
      65,
      65,
      65,
      65,
    ]);

    const iccOffset = findBytes(output, iccData);

    expect(iccOffset).toBeGreaterThanOrEqual(0);

    const tampered = new Uint8Array(output);
    tampered[iccOffset + iccData.length - 1] = 66;

    const result = await Effect.runPromiseExit(
      verifyJpeg(sourceFromBytes(tampered), target, {
        sourceManifest: prepared.sourceManifest,
      }),
    );

    expect(result._tag).toBe("Failure");
  });

  it("does not emit a byte when the replayed source header changed", async () => {
    const original = await fixture("baseline-minimal.jpg");
    const changed = new Uint8Array(original);
    changed[10] = (changed[10] ?? 0) === 0 ? 1 : 0;
    let opens = 0;

    const source: ReplayableJpeg = {
      open: () => {
        opens += 1;

        return sourceFromBytes(opens === 1 ? original : changed).open();
      },
    };

    const prepared = await Effect.runPromise(
      prepareJpegTransform(source, { description: "Doel", location: null, orientation: 1 }),
    );

    const output = await Effect.runPromise(prepared.open());
    const reader = output.getReader();
    await expect(reader.read()).rejects.toBeInstanceOf(JpegSourceChanged);
  });
});
