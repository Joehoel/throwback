import { createFileRoute } from "@tanstack/react-router";
import { handleDomainRequest } from "#/server/runtime.ts";

export const Route = createFileRoute("/api/domain/$")({
  server: {
    handlers: {
      DELETE: ({ request }) => handleDomainRequest(request),
      GET: ({ request }) => handleDomainRequest(request),
      PATCH: ({ request }) => handleDomainRequest(request),
      POST: ({ request }) => handleDomainRequest(request),
      PUT: ({ request }) => handleDomainRequest(request),
    },
  },
});
