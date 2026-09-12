import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { BuildCompatibilityLive } from "./build-compatibility.ts";
import { SignInRequired, ThrowbackApi } from "./contract.ts";

const BootstrapHandlers = HttpApiBuilder.group(ThrowbackApi, "bootstrap", (handlers) =>
  handlers.handle(
    "getBootstrap",
    Effect.fnUntraced(function* () {
      return yield* Effect.succeed(SignInRequired.make({}));
    }),
  ),
);

const ApiRoutes = HttpApiBuilder.layer(ThrowbackApi).pipe(
  Layer.provide(BootstrapHandlers),
  Layer.provide(BuildCompatibilityLive),
  Layer.provide(HttpServer.layerServices),
);

const DocsRoute = HttpApiScalar.layer(ThrowbackApi, { path: "/docs" }).pipe(
  Layer.provide(HttpServer.layerServices),
);

const { handler: domainHandler } = HttpRouter.toWebHandler(ApiRoutes);

const { handler: docsHandler } = HttpRouter.toWebHandler(DocsRoute);

const domainMount = "/api/domain";

const apiMount = "/api";

function rerouteRequest(request: Request, mount: string): Request {
  const url = new URL(request.url);

  url.pathname = url.pathname.slice(mount.length) || "/";

  return new Request(url, request);
}

export function handleDomainRequest(request: Request): Promise<Response> {
  return domainHandler(rerouteRequest(request, domainMount));
}

export function handleDocsRequest(request: Request): Promise<Response> {
  return docsHandler(rerouteRequest(request, apiMount));
}
