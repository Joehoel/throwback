import { Option, Schema, SchemaGetter } from "effect";
import { Description, Location } from "#/domains/shared/photo.ts";
import type { Rational, Rational3 } from "./reader.ts";

/**
 * The declarative read projection: raw, imperatively-read EXIF values (`reader.ts`)
 * plus the XMP description string → domain `MetadataFacts`, via decode-only Schema
 * transforms (mirrors `graph.ts`). All value meaning lives here — GPS rationals →
 * decimal, capture-date → year, XMP-over-EXIF precedence, trim/non-blank, the
 * orientation default — reusing the domain's own schemas (`Location`, `Description`)
 * for their checks rather than hand-rolling null/trim/range logic.
 *
 * Decode-only on purpose (ADR-0019): the *write* is a lossless merge into existing
 * bytes, which Schema's value-only `encode` can't express — so `encode` is forbidden.
 */

const readOnly = () => "metadata read is decode-only";

// --- Beschrijving: XMP wins over the (possibly accent-corrupt) EXIF field ---

/** A caption with surrounding whitespace trimmed; blank decodes to `None`, not "". */
const Caption = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()));
const toCaption = Schema.decodeUnknownOption(Caption);

const DescriptionSources = Schema.Struct({
  xmp: Schema.NullOr(Schema.String),
  exif: Schema.NullOr(Schema.String),
});

const DescriptionFromSources = DescriptionSources.pipe(
  Schema.decodeTo(Schema.NullOr(Description), {
    decode: SchemaGetter.transform(({ xmp, exif }) =>
      toCaption(xmp).pipe(
        Option.orElse(() => toCaption(exif)),
        Option.getOrNull,
      ),
    ),
    encode: SchemaGetter.forbidden(readOnly),
  }),
);

// --- Jaar: shallowest 4 digits of the EXIF capture date (path-year wins upstream) ---

const YearFromCaptureDate = Schema.NullOr(Schema.String).pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Int), {
    decode: SchemaGetter.transform((date) => {
      const year = date === null ? undefined : /^(?<year>\d{4})/u.exec(date)?.groups?.year;
      return year === undefined ? null : Number(year);
    }),
    encode: SchemaGetter.forbidden(readOnly),
  }),
);

// --- Locatie: GPS rationals → decimal, range-checked by the Location schema ---

const RationalSchema = Schema.Tuple([Schema.Number, Schema.Number]);
const RawGpsSchema = Schema.Struct({
  lat: Schema.Tuple([RationalSchema, RationalSchema, RationalSchema]),
  latRef: Schema.String,
  lon: Schema.Tuple([RationalSchema, RationalSchema, RationalSchema]),
  lonRef: Schema.String,
});

const ratio = ([numerator, denominator]: Rational): number => numerator / denominator;

/** DMS rationals → decimal degrees, negated for the southern/western hemisphere. */
const toDegrees = (dms: Rational3, ref: string): number => {
  const degrees = ratio(dms[0]) + ratio(dms[1]) / 60 + ratio(dms[2]) / 3600;
  return ref === "S" || ref === "W" ? -degrees : degrees;
};

const toLocation = Schema.decodeUnknownOption(Location);

const LocationFromGps = Schema.NullOr(RawGpsSchema).pipe(
  Schema.decodeTo(Schema.NullOr(Location), {
    decode: SchemaGetter.transform((gps) =>
      Option.fromNullOr(gps).pipe(
        Option.flatMap((raw) =>
          toLocation({
            latitude: toDegrees(raw.lat, raw.latRef),
            longitude: toDegrees(raw.lon, raw.lonRef),
          }),
        ),
        Option.getOrNull,
      ),
    ),
    encode: SchemaGetter.forbidden(readOnly),
  }),
);

// --- Oriëntatie: EXIF flag 1–8, defaulting to 1 (upright) ---

const ValidOrientation = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 8 })),
);
const toOrientation = Schema.decodeUnknownOption(ValidOrientation);

const OrientationFromRaw = Schema.NullOr(Schema.Number).pipe(
  Schema.decodeTo(Schema.Int, {
    decode: SchemaGetter.transform((value) => toOrientation(value).pipe(Option.getOrElse(() => 1))),
    encode: SchemaGetter.forbidden(readOnly),
  }),
);

/** Raw, imperatively-read metadata → domain facts (decode-only). */
const MetadataFromRaw = Schema.Struct({
  description: DescriptionFromSources,
  year: YearFromCaptureDate,
  location: LocationFromGps,
  orientation: OrientationFromRaw,
});

/** The curated fields the UI reads. */
export type MetadataFacts = typeof MetadataFromRaw.Type;

/** The raw shape the codec assembles (EXIF values + XMP description). */
export type RawMetadata = typeof MetadataFromRaw.Encoded;

/** Decode raw metadata into domain facts. Raw is codec-produced, so this is total. */
export const decodeMetadata = Schema.decodeUnknownSync(MetadataFromRaw);
