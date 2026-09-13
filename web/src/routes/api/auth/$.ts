import { createFileRoute } from "@tanstack/react-router";
import { handleAuthRequest } from "#/server/runtime.ts";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      DELETE: ({ request }) => handleAuthRequest(request),
      GET: ({ request }) => handleAuthRequest(request),
      PATCH: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
      PUT: ({ request }) => handleAuthRequest(request),
    },
  },
});
