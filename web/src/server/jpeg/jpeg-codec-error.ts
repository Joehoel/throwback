import { Effect, Option, Schema } from "effect";
import { JpegCodecError, JpegSourceUnavailable } from "./errors.ts";

/** Translate an unknown adapter failure into the codec's closed expected-error union. */
export function toJpegCodecError(cause: unknown, operation: string): JpegCodecError {
  return Option.getOrElse(
    Schema.decodeUnknownOption(JpegCodecError)(cause),
    () =>
      new JpegSourceUnavailable({
        operation,
        message: `JPEG source unavailable during ${operation}.`,
      }),
  );
}

/** Run synchronous codec logic in the expected Effect error channel. */
export function attemptJpeg<A>(
  operation: string,
  evaluate: () => A,
): Effect.Effect<A, JpegCodecError> {
  return Effect.try({
    try: evaluate,
    catch: (cause) => toJpegCodecError(cause, operation),
  });
}
