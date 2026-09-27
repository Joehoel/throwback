import { Effect } from "effect";
import { JpegVerificationFailed } from "./errors.ts";
import { attemptJpeg, toJpegCodecError } from "./jpeg-codec-error.ts";
import { inspectParsedJpeg, verifyParsedJpeg, verifyTransformedMetadata } from "./jpeg-metadata.ts";
import { DEFAULT_MAX_JPEG_HEADER_BYTES, parseJpegStream } from "./jpeg-parser.ts";
import { replayTransformedJpeg, transformedJpegHeader } from "./jpeg-transform-stream.ts";
import type {
  JpegPreservationManifest,
  PhotoMetadataTarget,
  PreparedJpegTransform,
  ReplayableJpeg,
} from "./model.ts";

/** Options that bound retained JPEG metadata and header bytes. */
export interface JpegCodecOptions {
  readonly maxHeaderBytes?: number;
}

/** Verification inputs paired with the source preservation proof. */
export interface VerifyJpegOptions extends JpegCodecOptions {
  readonly sourceManifest: JpegPreservationManifest;
}

function maxHeaderBytes(options: JpegCodecOptions): number {
  return options.maxHeaderBytes ?? DEFAULT_MAX_JPEG_HEADER_BYTES;
}

function parseSource(
  source: ReplayableJpeg,
  operation: string,
  limit: number,
): Effect.Effect<Awaited<ReturnType<typeof parseJpegStream>>, ReturnType<typeof toJpegCodecError>> {
  return source.open().pipe(
    Effect.flatMap((stream) =>
      Effect.tryPromise({
        try: () => parseJpegStream(stream, limit),
        catch: (cause) => toJpegCodecError(cause, operation),
      }),
    ),
  );
}

/** Inspect and structurally validate a replayable JPEG with bounded memory. */
export const inspectJpeg = Effect.fn("JpegCodec.inspect")(function* (
  source: ReplayableJpeg,
  options: JpegCodecOptions = {},
) {
  const limit = maxHeaderBytes(options);
  const parsed = yield* parseSource(source, "inspect", limit);

  return yield* attemptJpeg("inspect metadata", () => inspectParsedJpeg(parsed, limit));
});

/** Preflight a complete immutable target before exposing replayable transformed bytes. */
export const prepareJpegTransform = Effect.fn("JpegCodec.prepareTransform")(function* (
  source: ReplayableJpeg,
  target: PhotoMetadataTarget,
  options: JpegCodecOptions = {},
) {
  const limit = maxHeaderBytes(options);
  const parsed = yield* parseSource(source, "transform preflight", limit);

  const sourceInspection = yield* attemptJpeg("transform metadata inspection", () =>
    inspectParsedJpeg(parsed, limit),
  );

  const transformed = yield* attemptJpeg("transform header", () =>
    transformedJpegHeader(parsed, target),
  );

  if (transformed.bytes.length > limit) {
    return yield* new JpegVerificationFailed({
      reason: "transformed header exceeds configured bound",
      message: "JPEG verification failed: transformed header exceeds the configured safety limit.",
    });
  }

  yield* attemptJpeg("transform verification", () => {
    verifyTransformedMetadata(sourceInspection, transformed, target);
  });

  const prepared: PreparedJpegTransform = {
    byteLength: parsed.byteLength - parsed.headerByteLength + transformed.bytes.length,
    sourceManifest: sourceInspection.manifest,
    open: Effect.fn("JpegCodec.Prepared.open")(function* () {
      const replay = yield* source.open();

      return replayTransformedJpeg(replay, parsed, transformed.bytes);
    }),
  };

  return prepared;
});

/** Reread output and prove both the complete target and source preservation manifest. */
export const verifyJpeg = Effect.fn("JpegCodec.verify")(function* (
  output: ReplayableJpeg,
  target: PhotoMetadataTarget,
  options: VerifyJpegOptions,
) {
  const limit = maxHeaderBytes(options);
  const parsed = yield* parseSource(output, "verify", limit);

  return yield* attemptJpeg("verify target and preservation", () =>
    verifyParsedJpeg({
      parsed,
      target,
      sourceManifest: options.sourceManifest,
      maxHeaderBytes: limit,
    }),
  );
});
