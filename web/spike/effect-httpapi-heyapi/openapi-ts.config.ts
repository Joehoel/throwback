import { defineConfig } from "@hey-api/openapi-ts";

function identifierBrand(format: string | undefined): "CommandId" | "DriveId" | "DriveItemId" | undefined {
  switch (format) {
    case "throwback-command-id":
      return "CommandId";
    case "throwback-drive-id":
      return "DriveId";
    case "throwback-drive-item-id":
      return "DriveItemId";
    default:
      return undefined;
  }
}

export default defineConfig({
  input: "./openapi.json",
  output: {
    path: "./generated",
    postProcess: ["prettier"],
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      $resolvers: {
        string: ({ $, plugin, schema }) => {
          const brand = identifierBrand(schema.format);
          if (brand === undefined) return undefined;
          const valibotBrand = plugin.symbolOnce("Brand", {
            external: "valibot",
            kind: "type",
          });
          return $.type.and(
            $.type("string"),
            $.type(valibotBrand).generic($.type.literal(brand)),
          );
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
            const { $, symbols } = context;
            context.nodes.format = () => $(symbols.v).attr("brand").call($.literal(brand));
          }
        },
        validator: {
          response: ({ operation }) =>
            operation.operationId === "getPreview" ? null : undefined,
        },
      },
    },
    "@tanstack/react-query",
  ],
});
