import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
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

const { handler } = HttpRouter.toWebHandler(ApiRoutes);

const domainMount = "/api/domain";

export function handleDomainRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  url.pathname = url.pathname.slice(domainMount.length) || "/";

  return handler(new Request(url, request));
}
