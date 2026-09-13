import { OpenApi } from "effect/unstable/httpapi";
import { ThrowbackApi } from "./contract.ts";

const specification = OpenApi.fromApi(ThrowbackApi);

export function handleOpenApiRequest(): Response {
  return Response.json(specification, {
    headers: { "cache-control": "no-store" },
  });
}
