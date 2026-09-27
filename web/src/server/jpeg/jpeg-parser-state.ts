import { JpegLimitExceeded, UnsupportedJpegStructure } from "./errors.ts";
import { ByteFingerprint } from "./fingerprint.ts";
import {
  INITIAL_HEADER_CAPACITY,
  malformedJpeg,
  MAX_HEADER_SEGMENTS,
  nextHeaderByteCount,
} from "./jpeg-parser-model.ts";
import type { ParsedJpeg, ParserMode } from "./jpeg-parser-model.ts";
import { isManagedSegment, markerHasLength, segmentFingerprint } from "./jpeg-segment.ts";
import type { JpegSegment } from "./jpeg-segment.ts";

/** Incremental JPEG container parser that retains only a bounded first-scan header. */
export class JpegParser {
  readonly #maxHeaderBytes: number;
  readonly #fullHash = new ByteFingerprint();
  readonly #tailHash = new ByteFingerprint();
  readonly #segments: JpegSegment[] = [];
  readonly #preservedSegmentFingerprints: string[] = [];
  #header: Uint8Array;
  #mode: ParserMode = "start";
  #offset = 0;
  #headerByteLength = 0;
  #observedHeaderBytes = 0;
  #tailByteLength = 0;
  #headerComplete = false;
  #segmentBytes: number[] = [];
  #marker = 0;
  #lengthBytesRead = 0;
  #payloadRemaining = 0;
  #scanPendingFf = 0;
  #scanCount = 0;
  #sawFrame = false;
  #sawEoi = false;

  /** Create a parser with a strict upper bound for retained pre-scan bytes. */
  public constructor(maxHeaderBytes: number) {
    if (!Number.isSafeInteger(maxHeaderBytes) || maxHeaderBytes <= 0) {
      throw new JpegLimitExceeded({
        limit: maxHeaderBytes,
        observed: 0,
        message: "JPEG header safety limit must be a positive integer.",
      });
    }

    this.#maxHeaderBytes = maxHeaderBytes;
    this.#header = new Uint8Array(Math.min(maxHeaderBytes, INITIAL_HEADER_CAPACITY));
  }

  /** Consume the next ordered source chunk. */
  public feed(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return;
    }

    if (this.#mode === "done") {
      throw malformedJpeg(this.#offset, "bytes follow the EOI marker");
    }

    this.#fullHash.update(chunk);
    const headerWasComplete = this.#headerComplete;
    let tailStart = headerWasComplete ? 0 : -1;

    for (let index = 0; index < chunk.length; index += 1) {
      if (!this.#headerComplete) {
        this.#observedHeaderBytes = nextHeaderByteCount(
          this.#observedHeaderBytes,
          this.#maxHeaderBytes,
        );
      }

      this.#consume(chunk[index] ?? 0);
      this.#offset += 1;

      if (!headerWasComplete && tailStart === -1 && this.#headerComplete) {
        tailStart = index + 1;
      }
    }

    if (!headerWasComplete) {
      const headerEnd = tailStart === -1 ? chunk.length : tailStart;
      this.#appendHeader(chunk.subarray(0, headerEnd));
    }

    if (tailStart >= 0 && tailStart < chunk.length) {
      const tail = chunk.subarray(tailStart);
      this.#tailHash.update(tail);
      this.#tailByteLength += tail.length;
    }
  }

  /** Complete structural validation and return the bounded parse result. */
  public finish(): ParsedJpeg {
    if (!this.#sawEoi) {
      throw malformedJpeg(this.#offset, "EOI marker is missing");
    }

    if (!this.#headerComplete || this.#scanCount === 0) {
      throw malformedJpeg(this.#offset, "JPEG has no entropy-coded scan");
    }

    if (!this.#sawFrame) {
      throw malformedJpeg(this.#offset, "JPEG has no frame header");
    }

    if (this.#mode !== "done") {
      throw malformedJpeg(this.#offset, "JPEG ended inside a segment");
    }

    return {
      header: this.#header.slice(0, this.#headerByteLength),
      headerByteLength: this.#headerByteLength,
      byteLength: this.#offset,
      fingerprint: this.#fullHash.digest(),
      tailByteLength: this.#tailByteLength,
      tailFingerprint: this.#tailHash.digest(),
      scanCount: this.#scanCount,
      segments: this.#segments,
      preservedSegmentFingerprints: this.#preservedSegmentFingerprints,
    };
  }

  #appendHeader(bytes: Uint8Array): void {
    const required = this.#headerByteLength + bytes.length;

    if (required > this.#maxHeaderBytes) {
      throw new JpegLimitExceeded({
        limit: this.#maxHeaderBytes,
        observed: required,
        message: `JPEG header exceeds the ${this.#maxHeaderBytes}-byte safety limit.`,
      });
    }

    if (required > this.#header.length) {
      const capacity = Math.min(this.#maxHeaderBytes, Math.max(required, this.#header.length * 2));
      const expanded = new Uint8Array(capacity);
      expanded.set(this.#header.subarray(0, this.#headerByteLength));
      this.#header = expanded;
    }

    this.#header.set(bytes, this.#headerByteLength);
    this.#headerByteLength = required;
  }

  #consume(byte: number): void {
    switch (this.#mode) {
      case "start": {
        this.#consumeStart(byte);

        return;
      }

      case "marker-prefix": {
        this.#consumeMarkerPrefix(byte);

        return;
      }

      case "marker-code": {
        this.#consumeMarkerCode(byte);

        return;
      }

      case "length": {
        this.#consumeLength(byte);

        return;
      }

      case "payload": {
        this.#consumePayload(byte);

        return;
      }

      case "scan": {
        this.#consumeScan(byte);

        return;
      }

      case "done": {
        throw malformedJpeg(this.#offset, "bytes follow the EOI marker");
      }

      default: {
        this.#mode satisfies never;
      }
    }
  }

  #consumeStart(byte: number): void {
    this.#segmentBytes.push(byte);

    if (this.#segmentBytes.length === 1 && byte !== 0xff) {
      throw malformedJpeg(this.#offset, "SOI marker is missing");
    }

    if (this.#segmentBytes.length === 2) {
      if (byte !== 0xd8) {
        throw malformedJpeg(this.#offset - 1, "SOI marker is missing");
      }

      this.#segmentBytes = [];
      this.#mode = "marker-prefix";
    }
  }

  #consumeMarkerPrefix(byte: number): void {
    if (byte !== 0xff) {
      throw malformedJpeg(this.#offset, "expected a marker prefix");
    }

    this.#segmentBytes = [byte];
    this.#mode = "marker-code";
  }

  #consumeMarkerCode(byte: number): void {
    this.#segmentBytes.push(byte);

    if (byte === 0xff) {
      return;
    }

    if (byte === 0x00) {
      throw malformedJpeg(this.#offset, "stuffed zero appears outside scan data");
    }

    this.#startMarker(byte);
  }

  #consumeLength(byte: number): void {
    this.#segmentBytes.push(byte);
    this.#lengthBytesRead += 1;

    if (this.#lengthBytesRead < 2) {
      return;
    }

    const high = this.#segmentBytes.at(-2) ?? 0;
    const low = this.#segmentBytes.at(-1) ?? 0;
    const length = high * 256 + low;

    if (length < 2) {
      throw malformedJpeg(this.#offset - 1, "segment length is smaller than two");
    }

    this.#payloadRemaining = length - 2;

    if (this.#payloadRemaining === 0) {
      this.#completeSegment();
    } else {
      this.#mode = "payload";
    }
  }

  #consumePayload(byte: number): void {
    this.#segmentBytes.push(byte);
    this.#payloadRemaining -= 1;

    if (this.#payloadRemaining === 0) {
      this.#completeSegment();
    }
  }

  #consumeScan(byte: number): void {
    if (this.#scanPendingFf === 0) {
      if (byte === 0xff) {
        this.#scanPendingFf = 1;
      }

      return;
    }

    if (byte === 0xff) {
      this.#scanPendingFf += 1;

      return;
    }

    if (byte === 0x00 || (byte >= 0xd0 && byte <= 0xd7)) {
      this.#scanPendingFf = 0;

      return;
    }

    this.#segmentBytes = Array.from({ length: this.#scanPendingFf }, () => 0xff);
    this.#segmentBytes.push(byte);
    this.#scanPendingFf = 0;
    this.#startMarker(byte);
  }

  #startMarker(marker: number): void {
    this.#marker = marker;

    if (marker === 0xd8) {
      throw malformedJpeg(this.#offset, "unexpected nested SOI marker");
    }

    if (markerHasLength(marker)) {
      this.#lengthBytesRead = 0;
      this.#mode = "length";
    } else {
      this.#completeSegment();
    }
  }

  #completeSegment(): void {
    const raw = Uint8Array.from(this.#segmentBytes);
    const prefixLength = raw.findIndex((byte) => byte !== 0xff) + 1;

    const payload = markerHasLength(this.#marker)
      ? raw.subarray(prefixLength + 2)
      : new Uint8Array();

    const beforeFirstScan = !this.#headerComplete;
    const managed = isManagedSegment(this.#marker, payload);

    if (!beforeFirstScan && managed) {
      throw new UnsupportedJpegStructure({
        reason: "managed metadata after first scan",
        message: "Unsupported JPEG structure: managed APP1 metadata occurs after the first scan.",
      });
    }

    if (beforeFirstScan) {
      this.#retainHeaderSegment(raw, payload, managed);
    }

    if (this.#isFrameMarker()) {
      this.#sawFrame = true;
    }

    this.#segmentBytes = [];

    if (this.#marker === 0xda) {
      this.#scanCount += 1;
      this.#headerComplete = true;
      this.#mode = "scan";
    } else if (this.#marker === 0xd9) {
      this.#sawEoi = true;
      this.#mode = "done";
    } else if (this.#marker >= 0xd0 && this.#marker <= 0xd7) {
      throw malformedJpeg(this.#offset, "restart marker appears outside scan data");
    } else {
      this.#mode = "marker-prefix";
    }
  }

  #retainHeaderSegment(raw: Uint8Array, payload: Uint8Array, managed: boolean): void {
    const observed = this.#segments.length + 1;

    if (observed > MAX_HEADER_SEGMENTS) {
      throw new JpegLimitExceeded({
        limit: MAX_HEADER_SEGMENTS,
        observed,
        message: `JPEG header exceeds the ${MAX_HEADER_SEGMENTS}-segment safety limit.`,
      });
    }

    const segment: JpegSegment = { marker: this.#marker, raw, payload, beforeFirstScan: true };
    this.#segments.push(segment);

    if (!managed) {
      this.#preservedSegmentFingerprints.push(segmentFingerprint(segment));
    }
  }

  #isFrameMarker(): boolean {
    return (
      this.#marker >= 0xc0 && this.#marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(this.#marker)
    );
  }
}
