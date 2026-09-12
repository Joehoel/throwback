import { createFileRoute } from "@tanstack/react-router";
import { handleDocsRequest } from "#/server/api/handler.ts";

export const Route = createFileRoute("/api/docs")({
  server: {
    handlers: {
      GET: ({ request }) => handleDocsRequest(request),
    },
  },
});
