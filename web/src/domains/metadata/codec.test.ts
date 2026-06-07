import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { jpegBinaryWithExif, jpegWithXmp } from "./__fixtures__/jpeg.ts";
import { pngBinary } from "./__fixtures__/png.ts";
import { PhotoMetadata, PhotoMetadataDefault } from "./codec.ts";

const JPEG = "image/jpeg";
const PNG = "image/png";

/**
 * The facade composes the codecs through their public interface and is format-aware:
 * for JPEG XMP wins for the description (ADR-0019) and EXIF owns GPS + orientation;
 * for PNG the description lives in XMP. Write is the lossless inverse.
 */
layer(PhotoMetadataDefault)("PhotoMetadata", (it) => {
  it.effect("prefers XMP dc:description over EXIF, keeps EXIF GPS + orientation", () =>
    Effect.gen(function* () {
      const exifPart = jpegBinaryWithExif({
        lat: 50.0875,
        lon: 14.4214,
        orientation: 6,
        description: "exif-tekst",
      });
      const jpeg = jpegWithXmp(exifPart, "xmp-tekst");

      const metadata = yield* PhotoMetadata;
      const facts = yield* metadata.read(jpeg, JPEG);
      expect(facts.description).toBe("xmp-tekst"); // XMP wins
      expect(facts.orientation).toBe(6); // EXIF
      expect(facts.location?.latitude).toBeCloseTo(50.0875, 3); // EXIF
    }),
  );

  it.effect("falls back to EXIF ImageDescription when XMP is absent", () =>
    Effect.gen(function* () {
      const jpeg = jpegBinaryWithExif({ description: "alleen-exif" });
      const metadata = yield* PhotoMetadata;
      const facts = yield* metadata.read(jpeg, JPEG);
      expect(facts.description).toBe("alleen-exif");
    }),
  );

  it.effect("writes JPEG description + location, then reads them back", () =>
    Effect.gen(function* () {
      const metadata = yield* PhotoMetadata;
      const written = metadata.write(jpegBinaryWithExif(), JPEG, {
        description: "Joël aan het meer",
        location: { latitude: 52.1, longitude: 5.2 },
        orientation: 6,
      });
      const facts = yield* metadata.read(written, JPEG);
      expect(facts.description).toBe("Joël aan het meer");
      expect(facts.location?.latitude).toBeCloseTo(52.1, 3);
      expect(facts.orientation).toBe(6);
    }),
  );

  it.effect("round-trips a PNG description through XMP", () =>
    Effect.gen(function* () {
      const metadata = yield* PhotoMetadata;
      const written = metadata.write(pngBinary(), PNG, {
        description: "Joël in de tuin",
        location: null,
        orientation: null,
      });
      const facts = yield* metadata.read(written, PNG);
      expect(facts.description).toBe("Joël in de tuin");
    }),
  );
});
