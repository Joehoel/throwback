import { defineConfig } from "@hey-api/openapi-ts";

type IdentifierBrand = "EventId" | "LibraryId" | "PhotoId";

const identifierBrands = new Map<string, IdentifierBrand>([
  ["throwback-event-id", "EventId"],
  ["throwback-library-id", "LibraryId"],
  ["throwback-photo-id", "PhotoId"],
]);

function identifierBrand(format: string | undefined): IdentifierBrand | undefined {
  return identifierBrands.get(format ?? "");
}

export default defineConfig({
  input: "./openapi.json",
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
