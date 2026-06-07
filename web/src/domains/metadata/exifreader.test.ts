import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Layer } from "effect";
import { jpegBinaryWithExif, jpegWithStandardXmp, jpegWithXmp } from "./__fixtures__/jpeg.ts";
import { Exif, PhotoMetadata, PhotoMetadataDefault, Xmp } from "./codec.ts";
import { ExifReaderLive, PhotoMetadataExifReader, XmpReaderLive } from "./exifreader.ts";
import { EMPTY, readExif } from "./reader.ts";

/**
 * The exifreader-backed backend (`exifreader.ts`) is a *parallel* implementation of
 * the `Exif` / `Xmp` services. These tests pin two things: it reads correctly, and it
 * agrees fact-for-fact with our own byte reader (`reader.ts`) on identical bytes — so
 * the two are genuinely interchangeable behind the `PhotoMetadata` facade. We drive
 * the real services through their layers (no peeking at internals).
 */

const RICH = jpegBinaryWithExif({
  lat: 50.0875,
  lon: 14.4214,
  orientation: 6,
  dateTimeOriginal: "2021:07:01 10:00:00",
  description: "Aan het meer",
});

/** Run a layer-provided effect synchronously (every read here is pure/sync). */
const run = <A, R>(effect: Effect.Effect<A, never, R>, layer: Layer.Layer<R>): A =>
  Effect.runSync(Effect.provide(effect, layer));

const readExifVia = Effect.flatMap(Exif, (exif) => exif.read(RICH));

describe("Exif via exifreader", () => {
  it("reads the seven tags from big-endian EXIF (piexif-written)", () => {
    const raw = run(readExifVia, ExifReaderLive);
    expect(raw.description).toBe("Aan het meer");
    expect(raw.captureDate).toBe("2021:07:01 10:00:00");
    expect(raw.orientation).toBe(6);
    expect(raw.gps?.latRef).toBe("N");
    expect(raw.gps?.lonRef).toBe("E");
  });

  it("agrees with our own reader fact-for-fact on the same bytes", () => {
    expect(run(readExifVia, ExifReaderLive)).toEqual(readExif(RICH));
  });

  it("omits gps when coordinates are absent", () => {
    const bin = jpegBinaryWithExif({ orientation: 3 });
    expect(
      run(
        Effect.flatMap(Exif, (exif) => exif.read(bin)),
        ExifReaderLive,
      ).gps,
    ).toBeNull();
  });

  it("returns EMPTY for EXIF-less JPEG and for non-JPEG input", () => {
    const read = (bin: string) =>
      run(
        Effect.flatMap(Exif, (exif) => exif.read(bin)),
        ExifReaderLive,
      );
    expect(read(jpegBinaryWithExif())).toEqual(EMPTY);
    expect(read("definitely not a jpeg")).toEqual(EMPTY);
  });

  it("degrades a truncated EXIF segment instead of failing", () => {
    const truncated = RICH.slice(0, 40);
    expect(() =>
      run(
        Effect.flatMap(Exif, (exif) => exif.read(truncated)),
        ExifReaderLive,
      ),
    ).not.toThrow();
  });
});

describe("Xmp via exifreader", () => {
  const readXmp = (bin: string) =>
    run(
      Effect.map(Xmp, (xmp) => xmp.readDescription(bin)),
      XmpReaderLive,
    );

  it("reads dc:description from spec-form XMP, accents intact", () => {
    const bin = jpegWithStandardXmp(jpegBinaryWithExif({ orientation: 1 }), "Aan het meer café");
    expect(readXmp(bin)).toBe("Aan het meer café");
  });

  it("returns null when there is no XMP", () => {
    expect(readXmp(jpegBinaryWithExif({ orientation: 1 }))).toBeNull();
  });

  it("does not recognise the non-spec (space-separated) XMP signature", () => {
    // Documents the interop gap: our `xmp.ts` writer emits a space, not a NUL, so a
    // strict parser like exifreader won't see it. Our own reader tolerates both.
    const bin = jpegWithXmp(jpegBinaryWithExif({ orientation: 1 }), "Aan het meer");
    expect(readXmp(bin)).toBeNull();
  });
});

describe("PhotoMetadata facade parity", () => {
  it("produces identical facts whichever backend is wired", () => {
    const bin = jpegWithStandardXmp(RICH, "Aan het meer café");
    const facts = (layer: typeof PhotoMetadataDefault) =>
      run(
        Effect.flatMap(PhotoMetadata, (metadata) => metadata.read(bin)),
        layer,
      );
    const viaExifReader = facts(PhotoMetadataExifReader);
    expect(viaExifReader).toEqual(facts(PhotoMetadataDefault));
    // and the facts are actually populated, not coincidentally-equal empties
    expect(viaExifReader.orientation).toBe(6);
    expect(viaExifReader.year).toBe(2021);
    expect(viaExifReader.location).not.toBeNull();
  });
});
