import { MalformedJpeg, UnsupportedJpegStructure } from "./errors.ts";

export const DC_NAMESPACE = "http://purl.org/dc/elements/1.1/";

export const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

export const XMP_NOTE_NAMESPACE = "http://ns.adobe.com/xmp/note/";

export const GENERATED_EMPTY_PACKET = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><tbRdf:RDF xmlns:tbRdf="${RDF_NAMESPACE}"></tbRdf:RDF></x:xmpmeta>`;

export const GENERATED_DESCRIPTION_OPEN = `<tbRdf:Description xmlns:tbRdf="${RDF_NAMESPACE}" xmlns:tbDc="${DC_NAMESPACE}">`;

export const GENERATED_DESCRIPTION_CLOSE = "</tbRdf:Description>";

export function malformedXmp(reason: string): MalformedJpeg {
  return new MalformedJpeg({ offset: 0, reason, message: `Malformed JPEG: ${reason}.` });
}

export function unsupportedXmp(reason: string): UnsupportedJpegStructure {
  return new UnsupportedJpegStructure({
    reason,
    message: `Unsupported JPEG structure: ${reason}.`,
  });
}

export function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw malformedXmp(`${label} is not valid UTF-8`);
  }
}

export function namespaces(packet: string): ReadonlyMap<string, string> {
  const mappings = new Map<string, string>();

  const expression =
    /\bxmlns:(?<prefix>[A-Za-z_][\w.-]*)\s*=\s*(?<quote>["'])(?<uri>.*?)\k<quote>/gsu;

  for (const match of packet.matchAll(expression)) {
    const prefix = match.groups?.prefix;
    const uri = match.groups?.uri;

    if (prefix !== undefined && uri !== undefined) {
      const existing = mappings.get(prefix);

      if (existing !== undefined && existing !== uri) {
        throw unsupportedXmp(`XMP namespace prefix ${prefix} is redefined`);
      }

      mappings.set(prefix, uri);
    }
  }

  return mappings;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function decodeXml(value: string): string {
  return value.replaceAll(
    /&(?<entity>#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/giu,
    (whole, entity: string) => {
      const named = new Map([
        ["amp", "&"],
        ["lt", "<"],
        ["gt", ">"],
        ["quot", '"'],
        ["apos", "'"],
      ]).get(entity);

      if (named !== undefined) {
        return named;
      }

      const numeric = entity.toLowerCase().startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Math.trunc(Number(entity.slice(1)));

      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : whole;
    },
  );
}

function markupEnd(packet: string, start: number): number {
  let quote = "";

  for (let index = start + 1; index < packet.length; index += 1) {
    const character = packet[index] ?? "";

    if (quote !== "") {
      if (character === quote) {
        quote = "";
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }

  throw malformedXmp("XMP element is not closed");
}

function specialMarkupEnd(packet: string, start: number): number | null {
  if (packet.startsWith("<!--", start)) {
    const end = packet.indexOf("-->", start + 4);

    if (end === -1) {
      throw malformedXmp("XMP comment is not closed");
    }

    return end + 3;
  }

  if (packet.startsWith("<?", start)) {
    const end = packet.indexOf("?>", start + 2);

    if (end === -1) {
      throw malformedXmp("XMP processing instruction is not closed");
    }

    return end + 2;
  }

  return null;
}

function applyTag(stack: string[], tag: string): void {
  const closing = tag.startsWith("/");
  const selfClosing = tag.endsWith("/");
  const expression = closing ? /^\/(?<name>[A-Za-z_][\w.:-]*)/u : /^(?<name>[A-Za-z_][\w.:-]*)/u;
  const name = expression.exec(tag)?.groups?.name;

  if (name === undefined) {
    throw malformedXmp("XMP element name is invalid");
  }

  if (closing) {
    if (selfClosing || stack.pop() !== name) {
      throw malformedXmp(`XMP closing element ${name} is unbalanced`);
    }
  } else if (!selfClosing) {
    stack.push(name);
  }
}

function assertBalancedElements(packet: string): void {
  const stack: string[] = [];
  let cursor = 0;

  while (cursor < packet.length) {
    const start = packet.indexOf("<", cursor);

    if (start === -1) {
      break;
    }

    const specialEnd = specialMarkupEnd(packet, start);

    switch (specialEnd) {
      case null: {
        const end = markupEnd(packet, start);
        applyTag(stack, packet.slice(start + 1, end).trim());
        cursor = end + 1;
        break;
      }

      default: {
        cursor = specialEnd;
      }
    }
  }

  if (stack.length > 0) {
    throw malformedXmp(`XMP element ${stack.at(-1) ?? "unknown"} is not closed`);
  }
}

/** Reject XML shapes that cannot be changed without a complete XML implementation. */
export function assertSafeXml(packet: string): void {
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/iu.test(packet)) {
    throw unsupportedXmp("DTD, entity declarations, and CDATA XMP cannot be rewritten safely");
  }

  const rdfTags = packet.match(/<\/?(?<prefix>[A-Za-z_][\w.-]*):RDF\b/gu) ?? [];

  if (rdfTags.length < 2) {
    throw malformedXmp("XMP has no complete RDF container");
  }

  if (/&(?!(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);)/iu.test(packet)) {
    throw unsupportedXmp("XMP contains an undeclared or unsupported entity reference");
  }

  assertBalancedElements(packet);
}
