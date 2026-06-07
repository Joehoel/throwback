import { Context, Effect, Layer } from "effect";
import { decodeMetadata } from "./facts.ts";
import type { MetadataFacts, RawMetadata } from "./facts.ts";
import { EMPTY, readExif } from "./reader.ts";
import type { RawExif } from "./reader.ts";
import { readXmpDescription } from "./xmp.ts";

/**
 * Metadata codec layer — backend-agnostic, the seam between "what metadata means
 * in bytes" and "where the bytes come from" (`PhotoSource`). Two complementary,
 * composable services do the *container* read (`Exif` walks the binary, `Xmp` the
 * XML packet); the `PhotoMetadata` facade projects their raw output to
 * `MetadataFacts` via the read schema (`facts.ts`), where every value transform +
 * XMP-over-EXIF precedence lives (ADR-0019).
 *
 * `Exif` is the single boundary that can throw (malformed EXIF), so it returns an
 * `Effect` and confines that risk to one `Effect.try` → `EMPTY` — no `try/catch`
 * elsewhere. Provide the services separately or together via `Layer`; `ExifFake`
 * swaps a canned reading in for tests. Read-only for now: the *write* (lossless
 * inject) is an imperative merge, not a Schema encode (ADR-0019).
 */

// --- EXIF service (GPS + orientation + legacy description) ---

export interface ExifApi {
  readonly read: (jpegBinary: string) => Effect.Effect<RawExif>;
}
export class Exif extends Context.Service<Exif, ExifApi>()("Exif") {}

export const ExifLive = Layer.succeed(
  Exif,
  Exif.of({
    read: (jpegBinary) =>
      Effect.try({ try: () => readExif(jpegBinary), catch: () => null }).pipe(
        Effect.orElseSucceed(() => EMPTY),
      ),
  }),
);

/** A fixed EXIF reading — for tests that drive the facade without real bytes. */
export const ExifFake = (raw: RawExif): Layer.Layer<Exif> =>
  Layer.succeed(Exif, Exif.of({ read: () => Effect.succeed(raw) }));

// --- XMP service (canonical description) ---

export interface XmpApi {
  readonly readDescription: (jpegBinary: string) => string | null;
}
export class Xmp extends Context.Service<Xmp, XmpApi>()("Xmp") {}
export const XmpLive = Layer.succeed(Xmp, Xmp.of({ readDescription: readXmpDescription }));

// --- facade ---

export interface PhotoMetadataApi {
  /** Read the curated fields; the read schema applies XMP-over-EXIF precedence. */
  readonly read: (jpegBinary: string) => Effect.Effect<MetadataFacts>;
}
export class PhotoMetadata extends Context.Service<PhotoMetadata, PhotoMetadataApi>()(
  "PhotoMetadata",
) {}

const make = Effect.all([Exif, Xmp]).pipe(
  Effect.map(([exif, xmp]) => {
    const read = (jpegBinary: string): Effect.Effect<MetadataFacts> =>
      exif.read(jpegBinary).pipe(
        Effect.map((raw) =>
          decodeMetadata({
            description: { xmp: xmp.readDescription(jpegBinary), exif: raw.description },
            year: raw.captureDate,
            location: raw.gps,
            orientation: raw.orientation,
          } satisfies RawMetadata),
        ),
      );
    return PhotoMetadata.of({ read });
  }),
);

/** The facade over whichever `Exif` + `Xmp` backend is provided (our own, or exifreader). */
export const PhotoMetadataLive = Layer.effect(PhotoMetadata)(make);

/** `PhotoMetadata` with both readers wired — provide this to a `PhotoSource`. */
export const PhotoMetadataDefault = PhotoMetadataLive.pipe(
  Layer.provide(Layer.mergeAll(ExifLive, XmpLive)),
);
