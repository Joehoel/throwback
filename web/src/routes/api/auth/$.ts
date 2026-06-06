import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth-server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await auth.handler(request);

        return response;
      },
      POST: async ({ request }) => {
        const response = await auth.handler(request);

        return response;
      },
    },
  },
});
