/**
 * XMP read path (the description side of the metadata codec). XMP is an RDF/XML
 * packet in its own APP1 segment (`http://ns.adobe.com/xap/1.0/`), UTF-8 encoded —
 * the canonical home for `Beschrijving` (ADR-0019), since EXIF `ImageDescription`
 * mangles non-ASCII. Pure: binary string in, text out; no Effect, no file I/O.
 *
 * Read-only for now; lossless XMP *write* (likely a library wrapped as a service)
 * lands in the write phase.
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
  const slice = binary.slice(start, end);
  const bytes = Uint8Array.from(slice, (ch) => (ch.codePointAt(0) ?? 0) % 256);
  return new TextDecoder("utf-8").decode(bytes);
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

/** The Beschrijving from XMP: `dc:description`, falling back to `dc:title`; null if absent. */
export function readXmpDescription(jpegBinary: string): string | null {
  const xml = extractXmpXml(jpegBinary);
  if (xml === null) {
    return null;
  }
  return pickProperty(xml, "dc:description") ?? pickProperty(xml, "dc:title");
}
