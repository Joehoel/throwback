import type { PhotoMetadataTarget } from "./model.ts";
import { fingerprint } from "./fingerprint.ts";
import {
  injectedProperties,
  managedRanges,
  propertyValue,
  removeRanges,
  unmanagedPacket,
} from "./xmp-properties.ts";
import {
  assertSafeXml,
  decodeUtf8,
  GENERATED_EMPTY_PACKET,
  malformedXmp,
  namespaces,
  RDF_NAMESPACE,
  unsupportedXmp,
} from "./xmp-xml.ts";

const STANDARD_PREFIX = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0");

const EMPTY_FINGERPRINT = fingerprint(new Uint8Array());

/** Parsed standard XMP packet and content-free unmanaged-property proof. */
export interface ParsedXmp {
  readonly description: string | null;
  readonly title: string | null;
  readonly unmanagedFingerprint: string;
  readonly packet: string;
}

/** Parse the standard XMP APP1 payload. */
export function parseXmp(payload: Uint8Array): ParsedXmp {
  if (!STANDARD_PREFIX.every((byte, index) => payload[index] === byte)) {
    throw malformedXmp("APP1 segment does not contain standard XMP");
  }

  const packet = decodeUtf8(payload.subarray(STANDARD_PREFIX.length), "standard XMP packet");
  assertSafeXml(packet);
  const ranges = managedRanges(packet);
  const descriptionRange = ranges.find((range) => range.property === "description");
  const titleRange = ranges.find((range) => range.property === "title");
  const preserved = unmanagedPacket(packet, ranges);

  return {
    description: descriptionRange === undefined ? null : propertyValue(descriptionRange, packet),
    title: titleRange === undefined ? null : propertyValue(titleRange, packet),
    unmanagedFingerprint:
      preserved === GENERATED_EMPTY_PACKET
        ? EMPTY_FINGERPRINT
        : fingerprint(new TextEncoder().encode(preserved)),
    packet,
  };
}

function rdfClosingIndex(packet: string): number {
  let rdfPrefix: string | undefined;

  for (const [prefix, uri] of namespaces(packet)) {
    if (uri === RDF_NAMESPACE) {
      rdfPrefix = prefix;
      break;
    }
  }

  if (rdfPrefix === undefined) {
    throw malformedXmp("XMP RDF namespace is missing");
  }

  const escapedPrefix = rdfPrefix.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const matches = [...packet.matchAll(new RegExp(`</${escapedPrefix}:RDF\\s*>`, "gu"))];

  if (matches.length !== 1) {
    throw unsupportedXmp("XMP has an ambiguous RDF container");
  }

  return Math.max(...matches.map((match) => match.index));
}

/** Surgically replace only managed Description properties in standard XMP. */
export function transformXmp(
  existingPayload: Uint8Array | null,
  target: PhotoMetadataTarget,
): Uint8Array | null {
  if (existingPayload === null && target.description === null) {
    return null;
  }

  const existingPacket =
    existingPayload === null ? GENERATED_EMPTY_PACKET : parseXmp(existingPayload).packet;

  let packet = removeRanges(existingPacket, managedRanges(existingPacket));

  if (target.description !== null) {
    const insertion = rdfClosingIndex(packet);
    packet =
      packet.slice(0, insertion) + injectedProperties(target.description) + packet.slice(insertion);
  }

  const bytes = new TextEncoder().encode(packet);
  const payload = new Uint8Array(STANDARD_PREFIX.length + bytes.length);
  payload.set(STANDARD_PREFIX);
  payload.set(bytes, STANDARD_PREFIX.length);

  if (payload.length > 65_533) {
    throw unsupportedXmp("rewritten standard XMP exceeds one APP1 segment");
  }

  return payload;
}

export { validateExtendedXmp } from "./extended-xmp.ts";
