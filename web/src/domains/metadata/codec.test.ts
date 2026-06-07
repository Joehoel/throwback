import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { jpegBinaryWithExif, jpegWithXmp } from "./__fixtures__/jpeg.ts";
import { PhotoMetadata, PhotoMetadataDefault } from "./codec.ts";

/**
 * The facade composes the two codecs through their public interface: XMP wins for
 * the description (ADR-0019), EXIF owns GPS + orientation.
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
      const facts = yield* metadata.read(jpeg);
      expect(facts.description).toBe("xmp-tekst"); // XMP wins
      expect(facts.orientation).toBe(6); // EXIF
      expect(facts.location?.latitude).toBeCloseTo(50.0875, 3); // EXIF
    }),
  );

  it.effect("falls back to EXIF ImageDescription when XMP is absent", () =>
    Effect.gen(function* () {
      const jpeg = jpegBinaryWithExif({ description: "alleen-exif" });
      const metadata = yield* PhotoMetadata;
      const facts = yield* metadata.read(jpeg);
      expect(facts.description).toBe("alleen-exif");
    }),
  );
});
