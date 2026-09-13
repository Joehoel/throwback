import { env } from "cloudflare:workers";
import { Effect, Layer, Redacted } from "effect";
import { createDomainRequestHandler } from "./api/handler.ts";
import { layerBetterAuthApplicationSession } from "./auth/application-session.ts";
import { createThrowbackAuth } from "./auth/auth.ts";
import { CuratorAccessLive } from "./curator/curator-access.ts";
import { CuratorStore, layerD1CuratorStore } from "./curator/curator-store.ts";

const runtime = Effect.gen(function* () {
  const curatorStore = yield* CuratorStore;

  const auth = createThrowbackAuth({
    baseURL: env.BETTER_AUTH_URL,
    callbackURL: env.MICROSOFT_CALLBACK_URL,
    curatorStore,
    database: env.DB,
    microsoftClientId: env.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: Redacted.make(env.MICROSOFT_CLIENT_SECRET),
    secret: Redacted.make(env.BETTER_AUTH_SECRET),
  });

  const curatorAccessLayer = CuratorAccessLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        layerBetterAuthApplicationSession(auth),
        Layer.succeed(CuratorStore, curatorStore),
      ),
    ),
  );

  return {
    auth,
    domainHandler: createDomainRequestHandler(curatorAccessLayer),
  };
}).pipe(Effect.provide(layerD1CuratorStore(env.DB)), Effect.runSync);

/** Handle a Better Auth protocol request. */
export function handleAuthRequest(request: Request): Promise<Response> {
  return runtime.auth.handler(request);
}

/** Handle a same-origin Throwback domain API request. */
export function handleDomainRequest(request: Request): Promise<Response> {
  return runtime.domainHandler(request);
}
