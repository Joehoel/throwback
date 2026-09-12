import { createFileRoute } from "@tanstack/react-router";
import { handleUnconfiguredAuthRequest } from "#/server/auth/unconfigured-handler.ts";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      DELETE: handleUnconfiguredAuthRequest,
      GET: handleUnconfiguredAuthRequest,
      PATCH: handleUnconfiguredAuthRequest,
      POST: handleUnconfiguredAuthRequest,
      PUT: handleUnconfiguredAuthRequest,
    },
  },
});
