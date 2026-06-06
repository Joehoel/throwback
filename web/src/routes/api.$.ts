import "#/polyfill";

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { SmartCoercionPlugin } from "@orpc/json-schema";
import { createFileRoute } from "@tanstack/react-router";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";

import { TodoSchema } from "#/orpc/schema";
import router from "#/orpc/router";

const handler = new OpenAPIHandler(router, {
  plugins: [
    new SmartCoercionPlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
    new OpenAPIReferencePlugin({
      docsConfig: {
        authentication: {
          securitySchemes: {
            bearerAuth: {
              token: "default-token",
            },
          },
        },
      },
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        commonSchemas: {
          Todo: { schema: TodoSchema },
          UndefinedError: { error: "UndefinedError" },
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              scheme: "bearer",
              type: "http",
            },
          },
        },
        info: {
          title: "TanStack ORPC Playground",
          version: "1.0.0",
        },
        security: [{ bearerAuth: [] }],
      },
    }),
  ],
});

async function handle({ request }: { request: Request }): Promise<Response> {
  const { response } = await handler.handle(request, {
    context: {},
    prefix: "/api",
  });

  return response ?? new Response("Not Found", { status: 404 });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: handle,
      GET: handle,
      HEAD: handle,
      PATCH: handle,
      POST: handle,
      PUT: handle,
    },
  },
});
