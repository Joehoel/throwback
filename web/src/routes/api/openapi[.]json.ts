import { createFileRoute } from "@tanstack/react-router";
import { handleOpenApiRequest } from "#/server/api/openapi.ts";

export const Route = createFileRoute("/api/openapi.json")({
  server: {
    handlers: {
      GET: () => handleOpenApiRequest(),
    },
  },
});
