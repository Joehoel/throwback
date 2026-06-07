import { load } from "exifreader";
import type { ExpandedTags } from "exifreader";
import { Effect, Layer } from "effect";
import { binaryToBytes } from "./binary.ts";
import { Exif, PhotoMetadataLive, Xmp } from "./codec.ts";
import { EMPTY } from "./reader.ts";
import type { RawExif, RawGps, Rational3 } from "./reader.ts";

/**
 * A *parallel* backend for the `Exif` and `Xmp` services (`codec.ts`), built on the
 * maintained, typesafe `exifreader` library instead of our own byte walk
 * (`reader.ts` / `xmp.ts`). It produces the exact same `RawExif` and description
 * shapes, so `facts.ts` and the `PhotoMetadata` facade consume it unchanged — the
 * two implementations are drop-in interchangeable and (by design) agree fact-for-fact.
 *
 * Why keep both: ours is tiny, dependency-free, JPEG-only, and reads seven tags;
 * exifreader is broader (IPTC, ICC, MakerNotes, PNG/HEIC/WebP/TIFF, real XMP) and
 * actively maintained, at the cost of a heavier dependency (+ `@xmldom/xmldom` for
 * XMP). This layer lets us A/B them and switch without touching consumers.
 *
 * exifreader takes bytes, not our latin1 binary string, so we re-hydrate the bytes
 * with `binaryToBytes`. Like `reader.ts`, both readers are total: `load` throws on
 * unrecognised data, so — exactly as `ExifLive` does — we confine that to a single
 * `Effect.try` and `orElseSucceed` to `EMPTY` / `null`. No `try/catch` in sight.
 *
 * Note (interop): exifreader follows the JPEG-XMP spec strictly — the APP1 payload
 * must start with the namespace URI *NUL-terminated* (`…xap/1.0/\0`). Our `xmp.ts`
 * writer currently emits a space there, which exifreader (and ExifTool/Lightroom)
 * will not recognise as XMP. Tracked separately; this reader is correct.
 */

/** Parse the JPEG into exifreader's expanded tag tree; unrecognised data fails to `null`. */
const loadTags = (jpegBinary: string): Effect.Effect<ExpandedTags, null> =>
  Effect.try({
    try: () => load(binaryToBytes(jpegBinary).buffer, { expanded: true }),
    catch: () => null,
  });

/** Build our raw GPS (DMS rationals + N/S/E/W refs) from exifreader's EXIF tags. */
const toRawGps = (exif: NonNullable<ExpandedTags["exif"]>): RawGps | null => {
  const lat = exif.GPSLatitude;
  const lon = exif.GPSLongitude;
  const latRef = exif.GPSLatitudeRef;
  const lonRef = exif.GPSLongitudeRef;
  if (lat === undefined || lon === undefined || latRef === undefined || lonRef === undefined) {
    return null;
  }
  return {
    lat: lat.value as Rational3,
    latRef: latRef.value[0] ?? "",
    lon: lon.value as Rational3,
    lonRef: lonRef.value[0] ?? "",
  };
};

/** Map exifreader's EXIF tags to our `RawExif` (pure; absent EXIF → `EMPTY`). */
const toRawExif = (tags: ExpandedTags): RawExif => {
  const { exif } = tags;
  if (exif === undefined) {
    return EMPTY;
  }
  return {
    description: exif.ImageDescription?.description ?? null,
    captureDate: exif.DateTimeOriginal?.description ?? null,
    orientation: exif.Orientation?.value ?? null,
    gps: toRawGps(exif),
  };
};

/** An XMP tag's readable text (exifreader resolves the `rdf:Alt` to `.description`); blank → null. */
const xmpText = (tag: { description?: string } | undefined): string | null => {
  const text = tag?.description?.trim();
  return text === undefined || text === "" ? null : text;
};

/** The XMP `Beschrijving`: `dc:description`, falling back to `dc:title` (pure). */
const toXmpDescription = (tags: ExpandedTags): string | null => {
  const { xmp } = tags;
  return xmp === undefined ? null : (xmpText(xmp.description) ?? xmpText(xmp.title));
};

// --- Effect-shaped reads (the seams used by the layers) ---

/** Read EXIF via exifreader; non-image / parse error degrades to `EMPTY`. */
const readExif = (jpegBinary: string): Effect.Effect<RawExif> =>
  loadTags(jpegBinary).pipe(
    Effect.map(toRawExif),
    Effect.orElseSucceed(() => EMPTY),
  );

/** Read the XMP description via exifreader; non-image / parse error / absent → `null`. */
const readXmpDescription = (jpegBinary: string): Effect.Effect<string | null> =>
  loadTags(jpegBinary).pipe(
    Effect.map(toXmpDescription),
    Effect.orElseSucceed(() => null),
  );

// --- Layers: the same `Exif` / `Xmp` services, exifreader-backed ---

/** `Exif`, read via exifreader (drop-in for `ExifLive`). */
export const ExifReaderLive = Layer.succeed(Exif, Exif.of({ read: readExif }));

/** `Xmp`, read via exifreader (drop-in for `XmpLive`). The interface is sync, so we run the read. */
export const XmpReaderLive = Layer.succeed(
  Xmp,
  Xmp.of({ readDescription: (jpegBinary) => Effect.runSync(readXmpDescription(jpegBinary)) }),
);

/** Both readers, exifreader-backed — provide to `PhotoMetadataLive` in place of the defaults. */
export const ExifReaderBackend = Layer.mergeAll(ExifReaderLive, XmpReaderLive);

/** `PhotoMetadata` facade wired to the exifreader backend (drop-in for `PhotoMetadataDefault`). */
export const PhotoMetadataExifReader = PhotoMetadataLive.pipe(Layer.provide(ExifReaderBackend));
