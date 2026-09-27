import { JpegSourceChanged, JpegVerificationFailed } from "./errors.ts";
import { transformExif } from "./exif.ts";
import { ByteFingerprint } from "./fingerprint.ts";
import { metadataSegments } from "./jpeg-metadata.ts";
import type { TransformedMetadata } from "./jpeg-metadata.ts";
import type { ParsedJpeg } from "./jpeg-parser.ts";
import type { PhotoMetadataTarget } from "./model.ts";
import { toJpegCodecError } from "./jpeg-codec-error.ts";
import { transformXmp } from "./xmp.ts";

/** Bounded replacement header plus the transformed metadata used by preflight verification. */
export interface TransformedJpegHeader extends TransformedMetadata {
  readonly bytes: Uint8Array;
}

function encodeSegment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;

  if (length > 0xff_ff) {
    throw new JpegVerificationFailed({
      reason: "replacement APP1 segment is too large",
      message: "JPEG verification failed: replacement APP1 segment exceeds the JPEG limit.",
    });
  }

  const raw = new Uint8Array(payload.length + 4);
  raw.set([0xff, marker, Math.floor(length / 256), length % 256]);
  raw.set(payload, 4);

  return raw;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export function transformedJpegHeader(
  parsed: ParsedJpeg,
  target: PhotoMetadataTarget,
): TransformedJpegHeader {
  const managed = metadataSegments(parsed);
  const exifPayload = transformExif(managed.exif?.payload ?? null, target);
  const xmpPayload = transformXmp(managed.xmp?.payload ?? null, target);
  const outputSegments: Uint8Array[] = [];
  let wroteExif = false;
  let wroteXmp = false;

  for (const segment of parsed.segments) {
    if (segment === managed.exif) {
      if (exifPayload !== null) {
        outputSegments.push(encodeSegment(0xe1, exifPayload));
      }

      wroteExif = true;
    } else if (segment === managed.xmp) {
      if (xmpPayload !== null) {
        outputSegments.push(encodeSegment(0xe1, xmpPayload));
      }

      wroteXmp = true;
    } else {
      outputSegments.push(segment.raw);
    }
  }

  const insertion = outputSegments.findIndex((raw) => raw[1] !== 0xe0);
  const insertionIndex = insertion === -1 ? outputSegments.length : insertion;
  const additions: Uint8Array[] = [];

  if (!wroteExif && exifPayload !== null) {
    additions.push(encodeSegment(0xe1, exifPayload));
  }

  if (!wroteXmp && xmpPayload !== null) {
    additions.push(encodeSegment(0xe1, xmpPayload));
  }

  outputSegments.splice(insertionIndex, 0, ...additions);

  return {
    bytes: concatenate([new Uint8Array([0xff, 0xd8]), ...outputSegments]),
    exifPayload,
    xmpPayload,
  };
}

interface ReplayState {
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly original: ParsedJpeg;
  readonly replacementHeader: Uint8Array;
  readonly hash: ByteFingerprint;
  compared: number;
  byteLength: number;
  emittedHeader: boolean;
  released: boolean;
}

function compareHeader(state: ReplayState, chunk: Uint8Array): number {
  const needed = state.original.header.length - state.compared;
  const comparing = Math.min(needed, chunk.length);

  for (let index = 0; index < comparing; index += 1) {
    if (chunk[index] !== state.original.header[state.compared + index]) {
      throw new JpegSourceChanged({
        message: "JPEG source header changed after codec preflight; no output was produced.",
      });
    }
  }

  state.compared += comparing;

  return comparing;
}

function releaseReader(state: ReplayState): void {
  if (state.released) {
    return;
  }

  state.reader.releaseLock();
  state.released = true;
}

function finishReplay(state: ReplayState, controller: ReadableStreamDefaultController): void {
  const sourceMatches =
    state.emittedHeader &&
    state.byteLength === state.original.byteLength &&
    state.hash.digest() === state.original.fingerprint;

  if (!sourceMatches) {
    throw new JpegSourceChanged({
      message: "JPEG source changed after codec preflight; prepared output was discarded.",
    });
  }

  controller.close();
  releaseReader(state);
}

async function pullNext(
  state: ReplayState,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  const result = await state.reader.read();

  if (result.done) {
    finishReplay(state, controller);

    return;
  }

  const chunk = result.value;
  state.hash.update(chunk);
  state.byteLength += chunk.length;
  let offset = 0;

  if (!state.emittedHeader) {
    offset = compareHeader(state, chunk);

    if (state.compared < state.original.header.length) {
      await pullNext(state, controller);

      return;
    }

    state.emittedHeader = true;
    controller.enqueue(state.replacementHeader);
  }

  if (offset < chunk.length) {
    controller.enqueue(chunk.subarray(offset));
  }
}

/** Replay immutable source bytes while replacing only the verified pre-scan header. */
export function replayTransformedJpeg(
  source: ReadableStream<Uint8Array>,
  original: ParsedJpeg,
  replacementHeader: Uint8Array,
): ReadableStream<Uint8Array> {
  const state: ReplayState = {
    reader: source.getReader(),
    original,
    replacementHeader,
    hash: new ByteFingerprint(),
    compared: 0,
    byteLength: 0,
    emittedHeader: false,
    released: false,
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        await pullNext(state, controller);
      } catch (error) {
        await state.reader.cancel(error).catch(() => false);
        releaseReader(state);
        controller.error(toJpegCodecError(error, "prepared output replay"));
      }
    },
    async cancel(reason) {
      await state.reader.cancel(reason);
      releaseReader(state);
    },
  });
}
