import {
  assertSafeXml,
  DC_NAMESPACE,
  decodeUtf8,
  malformedXmp,
  namespaces,
  unsupportedXmp,
  XMP_NOTE_NAMESPACE,
} from "./xmp-xml.ts";
import { managedRanges } from "./xmp-properties.ts";

const EXTENDED_PREFIX = new TextEncoder().encode("http://ns.adobe.com/xmp/extension/\0");

interface ExtendedChunk {
  readonly guid: string;
  readonly total: number;
  readonly offset: number;
  readonly bytes: Uint8Array;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function parseChunk(payload: Uint8Array, maxBytes: number): ExtendedChunk {
  const minimum = EXTENDED_PREFIX.length + 32 + 8;

  if (
    !EXTENDED_PREFIX.every((byte, index) => payload[index] === byte) ||
    payload.length < minimum
  ) {
    throw malformedXmp("extended XMP chunk header is invalid");
  }

  const guid = new TextDecoder("ascii").decode(
    payload.subarray(EXTENDED_PREFIX.length, EXTENDED_PREFIX.length + 32),
  );

  const total = readUint32(payload, EXTENDED_PREFIX.length + 32);
  const offset = readUint32(payload, EXTENDED_PREFIX.length + 36);
  const bytes = payload.subarray(minimum);

  if (total > maxBytes) {
    throw unsupportedXmp("extended XMP exceeds the metadata safety limit");
  }

  if (offset + bytes.length > total) {
    throw malformedXmp("extended XMP chunk exceeds its declared length");
  }

  return { guid, total, offset, bytes };
}

function extendedReferences(packet: string): readonly string[] {
  const references: string[] = [];

  for (const [prefix, uri] of namespaces(packet)) {
    if (uri === XMP_NOTE_NAMESPACE) {
      const escaped = prefix.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

      const expression = new RegExp(
        `${escaped}:HasExtendedXMP\\s*=\\s*(?<quote>["'])(?<guid>[\\dA-F]{32})\\k<quote>`,
        "gu",
      );

      for (const match of packet.matchAll(expression)) {
        const guid = match.groups?.guid;

        if (guid !== undefined) {
          references.push(guid);
        }
      }
    }
  }

  return references;
}

function assemble(chunks: readonly ExtendedChunk[], total: number): Uint8Array {
  const assembled = new Uint8Array(total);
  let cursor = 0;

  for (const chunk of chunks.toSorted((left, right) => left.offset - right.offset)) {
    if (chunk.offset !== cursor) {
      throw malformedXmp("extended XMP chunks overlap or have a gap");
    }

    assembled.set(chunk.bytes, chunk.offset);
    cursor += chunk.bytes.length;
  }

  if (cursor !== total) {
    throw malformedXmp("extended XMP is incomplete");
  }

  return assembled;
}

/** Validate and reassemble multipart extended XMP without changing its chunks. */
export function validateExtendedXmp(
  payloads: readonly Uint8Array[],
  standardPacket: string | null,
  maxBytes: number,
): void {
  if (payloads.length === 0) {
    return;
  }

  if (standardPacket === null) {
    throw unsupportedXmp("extended XMP has no standard XMP packet");
  }

  const chunks = payloads.map((payload) => parseChunk(payload, maxBytes));
  const [first] = chunks;

  if (!/^[\dA-F]{32}$/u.test(first.guid)) {
    throw malformedXmp("extended XMP GUID is invalid");
  }

  if (chunks.some((chunk) => chunk.guid !== first.guid || chunk.total !== first.total)) {
    throw unsupportedXmp("multiple extended XMP documents are interleaved");
  }

  const references = extendedReferences(standardPacket);

  if (references.length !== 1 || references[0] !== first.guid) {
    throw unsupportedXmp("standard XMP does not contain one matching extended XMP reference");
  }

  const extendedPacket = decodeUtf8(assemble(chunks, first.total), "extended XMP packet");
  assertSafeXml(extendedPacket);

  const hasDcNamespace = [...namespaces(extendedPacket)].some(([, uri]) => uri === DC_NAMESPACE);

  if (hasDcNamespace && managedRanges(extendedPacket).length > 0) {
    throw unsupportedXmp("managed Description fields in extended XMP are ambiguous");
  }
}
