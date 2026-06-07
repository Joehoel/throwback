import { Context, Effect, Layer } from "effect";
import type { Location } from "#/domains/shared/photo.ts";
import { writeExif } from "./exif.ts";
import { decodeMetadata } from "./facts.ts";
import type { MetadataFacts, RawMetadata } from "./facts.ts";
import { readPngDescription, writePngDescription } from "./png.ts";
import { EMPTY, readExif } from "./reader.ts";
import type { RawExif } from "./reader.ts";
import { readXmpDescription, writeXmpDescription } from "./xmp.ts";

/**
 * Metadata codec layer — backend-agnostic, the seam between "what metadata means
 * in bytes" and "where the bytes come from" (`PhotoSource`). The `Exif` + `Xmp`
 * services do the JPEG *container* read (swappable, with test fakes); the
 * `PhotoMetadata` facade is format-aware (JPEG vs PNG) and projects raw output to
 * `MetadataFacts` via the read schema (`facts.ts`), where every value transform +
 * XMP-over-EXIF precedence lives (ADR-0019).
 *
 * Write is a lossless imperative byte merge (ADR-0019), not a Schema encode: for
 * JPEG, Locatie/Oriëntatie + Windows XP tags to EXIF and canonical Beschrijving to
 * XMP; for PNG, Beschrijving to the XMP `iTXt` chunk (PNG GPS is deferred). Read
 * confines the one throwing boundary (malformed EXIF) to `Exif`'s `Effect.try`.
 */

const isPng = (mimeType: string): boolean => mimeType === "image/png";
const isJpeg = (mimeType: string): boolean => mimeType === "image/jpeg";

const NOTHING: RawMetadata = {
  description: { xmp: null, exif: null },
  year: null,
  location: null,
  orientation: null,
};

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

// --- XMP service (canonical description, JPEG) ---

export interface XmpApi {
  readonly readDescription: (jpegBinary: string) => string | null;
}
export class Xmp extends Context.Service<Xmp, XmpApi>()("Xmp") {}
export const XmpLive = Layer.succeed(Xmp, Xmp.of({ readDescription: readXmpDescription }));

// --- facade ---

/** The approved fields the curation writes back; `null` = leave as-is. */
export interface MetadataEdit {
  readonly description: string | null;
  readonly location: Location | null;
  readonly orientation: number | null;
}

export interface PhotoMetadataApi {
  /** Read the curated fields for a JPEG/PNG; the read schema applies precedence. */
  readonly read: (binary: string, mimeType: string) => Effect.Effect<MetadataFacts>;
  /** Lossless write-back of the approved fields; returns the new binary. */
  readonly write: (binary: string, mimeType: string, edit: MetadataEdit) => string;
}
export class PhotoMetadata extends Context.Service<PhotoMetadata, PhotoMetadataApi>()(
  "PhotoMetadata",
) {}

const make = Effect.all([Exif, Xmp]).pipe(
  Effect.map(([exif, xmp]) => {
    const read = (binary: string, mimeType: string): Effect.Effect<MetadataFacts> => {
      if (isJpeg(mimeType)) {
        return exif.read(binary).pipe(
          Effect.map((raw) =>
            decodeMetadata({
              description: { xmp: xmp.readDescription(binary), exif: raw.description },
              year: raw.captureDate,
              location: raw.gps,
              orientation: raw.orientation,
            } satisfies RawMetadata),
          ),
        );
      }
      const description = isPng(mimeType) ? readPngDescription(binary) : null;
      return Effect.succeed(
        decodeMetadata({ ...NOTHING, description: { xmp: description, exif: null } }),
      );
    };

    const write = (binary: string, mimeType: string, edit: MetadataEdit): string => {
      if (isPng(mimeType)) {
        return edit.description === null ? binary : writePngDescription(binary, edit.description);
      }
      if (isJpeg(mimeType)) {
        const withExif = writeExif(binary, {
          orientation: edit.orientation,
          location: edit.location,
          description: edit.description,
        });
        return edit.description === null
          ? withExif
          : writeXmpDescription(withExif, edit.description);
      }
      return binary; // formats we don't manage (gif/webp/avif) pass through untouched
    };

    return PhotoMetadata.of({ read, write });
  }),
);

/** The facade over whichever `Exif` + `Xmp` backend is provided (our own, or exifreader). */
export const PhotoMetadataLive = Layer.effect(PhotoMetadata)(make);

/** `PhotoMetadata` with both readers wired — provide this to a `PhotoSource`. */
export const PhotoMetadataDefault = PhotoMetadataLive.pipe(
  Layer.provide(Layer.mergeAll(ExifLive, XmpLive)),
);
