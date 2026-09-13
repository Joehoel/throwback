import { createFileRoute } from "@tanstack/react-router";
import { handlePrototypeRequest } from "../../../../spike/effect-httpapi-heyapi/src/handler.ts";

export const Route = createFileRoute("/prototypes/httpapi/$")({
  server: {
    handlers: {
      GET: ({ request }) => handlePrototypeRequest(request),
      POST: ({ request }) => handlePrototypeRequest(request),
    },
  },
});
