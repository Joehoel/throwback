import {
  DC_NAMESPACE,
  decodeXml,
  escapeXml,
  GENERATED_DESCRIPTION_CLOSE,
  GENERATED_DESCRIPTION_OPEN,
  namespaces,
  RDF_NAMESPACE,
  unsupportedXmp,
} from "./xmp-xml.ts";

export interface XmpManagedRange {
  readonly start: number;
  readonly end: number;
  readonly property: "description" | "title";
  readonly source: string;
}

function namespacePrefixes(packet: string, namespace: string): readonly string[] {
  const prefixes: string[] = [];

  for (const [prefix, uri] of namespaces(packet)) {
    if (uri === namespace) {
      prefixes.push(prefix);
    }
  }

  return prefixes;
}

function escapedExpression(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function elementRanges(
  packet: string,
  prefix: string,
  property: XmpManagedRange["property"],
): readonly XmpManagedRange[] {
  const escapedPrefix = escapedExpression(prefix);

  const element = new RegExp(
    `<${escapedPrefix}:${property}\\b[^>]*>(?<body>[\\s\\S]*?)<\\/${escapedPrefix}:${property}\\s*>|<${escapedPrefix}:${property}\\b[^>]*/\\s*>`,
    "giu",
  );

  const ranges: XmpManagedRange[] = [];

  for (const match of packet.matchAll(element)) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      property,
      source: match[0],
    });
  }

  const openings = packet.match(new RegExp(`<${escapedPrefix}:${property}\\b`, "giu"))?.length ?? 0;

  if (openings !== ranges.length) {
    throw unsupportedXmp(`unbalanced dc:${property} XMP property`);
  }

  return ranges;
}

function attributeRanges(
  packet: string,
  prefix: string,
  property: XmpManagedRange["property"],
): readonly XmpManagedRange[] {
  const attributes = new RegExp(
    `\\s+${escapedExpression(prefix)}:${property}\\s*=\\s*(?<quote>["'])(?<value>.*?)\\k<quote>`,
    "gsu",
  );

  const ranges: XmpManagedRange[] = [];

  for (const match of packet.matchAll(attributes)) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      property,
      source: match[0],
    });
  }

  return ranges;
}

/** Locate the Description mirrors managed inside a standard XMP packet. */
export function managedRanges(packet: string): readonly XmpManagedRange[] {
  const ranges: XmpManagedRange[] = [];

  for (const prefix of namespacePrefixes(packet, DC_NAMESPACE)) {
    for (const property of ["description", "title"] as const) {
      const elements = elementRanges(packet, prefix, property);
      const attributes = attributeRanges(packet, prefix, property);

      if (elements.length > 1 || attributes.length > 1) {
        throw unsupportedXmp(`ambiguous duplicate dc:${property} XMP property`);
      }

      ranges.push(...elements, ...attributes);
    }
  }

  return ranges.toSorted((left, right) => left.start - right.start);
}

export function removeRanges(packet: string, ranges: readonly XmpManagedRange[]): string {
  let output = packet;

  for (const range of ranges.toReversed()) {
    output = output.slice(0, range.start) + output.slice(range.end);
  }

  return output;
}

export function unmanagedPacket(packet: string, ranges: readonly XmpManagedRange[]): string {
  return removeRanges(packet, ranges).replaceAll(
    `${GENERATED_DESCRIPTION_OPEN}${GENERATED_DESCRIPTION_CLOSE}`,
    "",
  );
}

function listItemValue(range: XmpManagedRange, packet: string): string | null {
  for (const prefix of namespacePrefixes(packet, RDF_NAMESPACE)) {
    const items = [
      ...range.source.matchAll(
        new RegExp(
          `<${escapedExpression(prefix)}:li\\b(?<attrs>[^>]*)>(?<value>[\\s\\S]*?)<\\/${escapedExpression(prefix)}:li\\s*>`,
          "giu",
        ),
      ),
    ];

    if (items.length > 0) {
      const preferred =
        items.find((item) =>
          /\bxml:lang\s*=\s*["']x-default["']/iu.test(item.groups?.attrs ?? ""),
        ) ?? items[0];

      const value = preferred.groups?.value ?? "";

      if (/<[^>]+>/u.test(value)) {
        throw unsupportedXmp(`${range.property} XMP contains nested markup`);
      }

      return decodeXml(value.trim());
    }
  }

  return null;
}

export function propertyValue(range: XmpManagedRange, packet: string): string {
  if (/^\s/u.test(range.source)) {
    const value = /[=]\s*["'](?<value>.*)["']/su.exec(range.source)?.groups?.value ?? "";

    return decodeXml(value);
  }

  const itemValue = listItemValue(range, packet);

  if (itemValue !== null) {
    return itemValue;
  }

  const content = range.source.replace(/^<[^>]+>/u, "").replace(/<\/[^>]+>$/u, "");

  if (/<[^>]+>/u.test(content)) {
    throw unsupportedXmp(`${range.property} XMP has an unsupported RDF shape`);
  }

  return decodeXml(content.trim());
}

export function injectedProperties(description: string): string {
  const escaped = escapeXml(description);

  return `${GENERATED_DESCRIPTION_OPEN}<tbDc:title><tbRdf:Alt><tbRdf:li xml:lang="x-default">${escaped}</tbRdf:li></tbRdf:Alt></tbDc:title><tbDc:description><tbRdf:Alt><tbRdf:li xml:lang="x-default">${escaped}</tbRdf:li></tbRdf:Alt></tbDc:description>${GENERATED_DESCRIPTION_CLOSE}`;
}
