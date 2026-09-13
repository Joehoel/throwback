import { binaryToUtf8, utf8ToBinary } from "./binary.ts";

/**
 * XMP read/write (the description side of the metadata codec). XMP is an RDF/XML
 * packet — in JPEG it lives in an APP1 segment (`http://ns.adobe.com/xap/1.0/`),
 * in PNG in an `iTXt` chunk (`png.ts`). UTF-8 encoded; the canonical home for
 * `Beschrijving` (ADR-0019), since EXIF `ImageDescription` mangles non-ASCII. Pure:
 * binary string in, text/binary out; no Effect, no file I/O.
 *
 * The packet builder + description extractor are shared with the PNG path; the
 * JPEG container handling (APP1 swap) is here. The write is a lossless merge
 * (ADR-0019): only the XMP segment is swapped — an imperative byte merge, not a
 * Schema encode.
 */

const XMP_MARKER = "http://ns.adobe.com/xap/1.0/";

const CLOSE_TAG = "</x:xmpmeta>";

const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

/** Minimal XML entity decode (named + numeric) for extracted text. */
function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(?<entity>#x?[0-9a-f]+|amp|lt|gt|quot|apos);/giu,
    (full, entity: string) => {
      const named = NAMED_ENTITIES.get(entity.toLowerCase());

      if (named !== undefined) {
        return named;
      }

      const code = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);

      return Number.isNaN(code) ? full : String.fromCodePoint(code);
    },
  );
}

/**
 * Recover the UTF-8 XMP XML packet from a JPEG binary string (one char per byte).
 * The binary string is byte-preserving (latin1), so we map the packet slice back
 * to bytes and decode as UTF-8 — that is what keeps accents intact.
 */
function extractXmpXml(binary: string): string | null {
  const marker = binary.indexOf(XMP_MARKER);

  if (marker === -1) {
    return null;
  }

  const start = binary.indexOf("<", marker);

  if (start === -1) {
    return null;
  }

  const close = binary.indexOf(CLOSE_TAG, start);
  const end = close === -1 ? binary.indexOf("<?xpacket end", start) : close + CLOSE_TAG.length;

  if (end === -1) {
    return null;
  }

  return binaryToUtf8(binary.slice(start, end));
}

/** Pull the text of an RDF property (`<prop>…</prop>`, unwrapping an `rdf:li`). */
function pickProperty(xml: string, property: string): string | null {
  const block = new RegExp(`<${property}[^>]*>(?<body>[\\s\\S]*?)</${property}>`, "u").exec(xml);

  if (block?.groups?.body === undefined) {
    return null;
  }

  const li = /<rdf:li[^>]*>(?<text>[\s\S]*?)<\/rdf:li>/u.exec(block.groups.body);
  const raw = (li?.groups?.text ?? block.groups.body).trim();

  return raw === "" ? null : decodeEntities(raw);
}

/** Beschrijving from an XMP packet's XML: `dc:description`, falling back to `dc:title`. */
export const descriptionFromXml = (xml: string): string | null =>
  pickProperty(xml, "dc:description") ?? pickProperty(xml, "dc:title");

/** The Beschrijving from a JPEG's XMP packet; null if absent. */
export function readXmpDescription(jpegBinary: string): string | null {
  const xml = extractXmpXml(jpegBinary);

  return xml === null ? null : descriptionFromXml(xml);
}

// --- write ---

const XML_ESCAPES = new Map<string, string>([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
]);

/** Escape the three chars that aren't legal as raw XML element text. */
const escapeXml = (text: string): string =>
  text.replaceAll(/[&<>]/gu, (char) => XML_ESCAPES.get(char) ?? char);

/** The XMP RDF/XML packet carrying `description` as `dc:description` + `dc:title`. */
export function buildXmpPacket(description: string): string {
  const text = escapeXml(description);

  return (
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${text}</rdf:li></rdf:Alt></dc:description>` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${text}</rdf:li></rdf:Alt></dc:title>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>` +
    `<?xpacket end="w"?>`
  );
}

/** Drop any existing XMP APP1 segment so we never end up with two. */
function removeXmpSegment(jpeg: string): string {
  const marker = jpeg.indexOf(XMP_MARKER);
  const start = marker - 4; // back over the 0xFFE1 marker + 2-byte length

  if (marker === -1 || start < 0) {
    return jpeg;
  }

  const length = (jpeg.codePointAt(start + 2) ?? 0) * 256 + (jpeg.codePointAt(start + 3) ?? 0);

  return jpeg.slice(0, start) + jpeg.slice(start + 2 + length);
}

/**
 * Write `Beschrijving` as canonical XMP `dc:description`, mirrored to `dc:title`
 * (ADR-0019). Replaces any existing XMP APP1 and inserts the new one right after
 * SOI; all other segments (EXIF/ICC/pixels) are preserved. Returns the new JPEG
 * binary string.
 */
export function writeXmpDescription(jpegBinary: string, description: string): string {
  // The APP1 XMP namespace must be NUL-terminated per spec, so strict parsers
  // (ExifTool / Lightroom / exifreader) recognise it — a space is non-conformant.
  const payload = utf8ToBinary(
    `${XMP_MARKER}${String.fromCodePoint(0)}${buildXmpPacket(description)}`,
  );

  const length = payload.length + 2; // APP1 length counts its own 2 length bytes

  const segment =
    String.fromCodePoint(0xff, 0xe1, Math.trunc(length / 256), length % 256) + payload;

  const body = removeXmpSegment(jpegBinary);

  return body.slice(0, 2) + segment + body.slice(2); // insert just after SOI
}
