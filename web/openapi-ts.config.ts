import { defineConfig, toCase } from "@hey-api/openapi-ts";
import type { OpenApi } from "@hey-api/openapi-ts";
import { HashSet, Match, Option, Predicate, Schema } from "effect";

const identifierFormat = /^throwback-(?<suffix>[a-z][a-z0-9]*(?:-[a-z0-9]+)*-id)$/u;

type OpenApiDocument = OpenApi.V2_0_X | OpenApi.V3_0_X | OpenApi.V3_1_X;

const IdentifierFormat = Schema.String.check(Schema.isPattern(identifierFormat));

const parseIdentifierFormat = Schema.decodeUnknownOption(IdentifierFormat);

const IdentifierRefinement = Schema.Struct({
  format: IdentifierFormat,
  minLength: Schema.optionalKey(Schema.Number),
  maxLength: Schema.optionalKey(Schema.Number),
  pattern: Schema.optionalKey(Schema.String),
  "x-pattern-message": Schema.optionalKey(Schema.String),
});

const parseIdentifierRefinement = Schema.decodeUnknownOption(IdentifierRefinement);

const identifierRefinementKeys = HashSet.make(
  "format",
  "minLength",
  "maxLength",
  "pattern",
  "x-pattern-message",
);

type JsonPrimitive = boolean | null | number | string;

interface JsonObject {
  [key: string]: JsonValue;
}

type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

type TraversableValue = JsonValue | OpenApiDocument;

function isJsonArray(value: TraversableValue | undefined): value is JsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: TraversableValue | undefined): value is JsonObject {
  return Predicate.isObject(value) && !Array.isArray(value);
}

function identifierBrand(format: string | undefined): string | undefined {
  return parseIdentifierFormat(format).pipe(
    Option.flatMap((parsed) => Option.fromNullishOr(identifierFormat.exec(parsed)?.groups?.suffix)),
    Option.map((suffix) => toCase(suffix, "PascalCase")),
    Option.getOrUndefined,
  );
}

function hoistIdentifierRefinement(value: JsonObject): void {
  const { allOf } = value;

  if (value.type !== "string" || !isJsonArray(allOf) || allOf.length !== 1) {
    return;
  }

  const [member] = allOf;

  if (
    !isJsonObject(member) ||
    Object.keys(member).some(
      (key) =>
        !HashSet.has(identifierRefinementKeys, key) || (key in value && value[key] !== member[key]),
    )
  ) {
    return;
  }

  const refinement = parseIdentifierRefinement(member);

  if (Option.isNone(refinement)) {
    return;
  }

  Object.assign(value, refinement.value);
  delete value.allOf;
}

/** Hoist Effect's refined identifier annotation without flattening general intersections. */
function visitIdentifierSchemas(value: TraversableValue): void {
  Match.value(value).pipe(
    Match.when(isJsonArray, (members) => {
      for (const member of members) {
        visitIdentifierSchemas(member);
      }
    }),
    Match.when(isJsonObject, (record) => {
      for (const member of Object.values(record)) {
        visitIdentifierSchemas(member);
      }

      hoistIdentifierRefinement(record);
    }),
    Match.option,
  );
}

/** Hoist Effect's refined identifier annotation without flattening general intersections. */
function normalizeEffectIdentifierSchemas(document: OpenApiDocument): void {
  visitIdentifierSchemas(document);
}

export default defineConfig({
  input: "./openapi.json",
  parser: {
    patch: { input: normalizeEffectIdentifierSchemas },
  },
  output: {
    path: "./src/client/generated",
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      $resolvers: {
        string: ({ $, plugin, schema }) => {
          const brand = identifierBrand(schema.format);

          if (brand === undefined) {
            return void 0;
          }

          const valibotBrand = plugin.symbolOnce("Brand", {
            external: "valibot",
            kind: "type",
          });

          return $.type.and($.type("string"), $.type(valibotBrand).generic($.type.literal(brand)));
        },
      },
    },
    "@hey-api/client-fetch",
    { name: "@hey-api/sdk", validator: { response: "valibot" } },
    {
      name: "valibot",
      requests: false,
      responses: true,
      $resolvers: {
        string: (context) => {
          const brand = identifierBrand(context.schema.format);

          if (brand !== undefined) {
            const { $, plugin } = context;

            context.nodes.format = () => $(plugin.imports.v).attr("brand").call($.literal(brand));
          }
        },
      },
    },
    "@tanstack/react-query",
  ],
});
