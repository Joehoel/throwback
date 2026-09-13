import { env } from "cloudflare:workers";
import { layer as layerD1 } from "@effect/sql-d1/D1Client";
import { Effect, Layer, Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createDomainRequestHandler } from "./api/handler.ts";
import { ApplicationLive } from "./application-layer.ts";
import { createThrowbackAuth } from "./auth/auth.ts";
import { BetterAuthServer } from "./auth/better-auth-server.ts";
import { CuratorStore, CuratorStoreLive } from "./curator/curator-store.ts";
import { LibraryStore, LibraryStoreLive } from "./library/library-store.ts";

const SqlLive = layerD1({ db: env.DB });

const PersistenceLive = Layer.mergeAll(CuratorStoreLive, LibraryStoreLive).pipe(
  Layer.provide(SqlLive),
);

const runtime = Effect.gen(function* () {
  const curatorStore = yield* CuratorStore;
  const libraryStore = yield* LibraryStore;

  const auth = createThrowbackAuth({
    baseURL: env.BETTER_AUTH_URL,
    callbackURL: env.MICROSOFT_CALLBACK_URL,
    curatorStore,
    database: env.DB,
    microsoftClientId: env.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: Redacted.make(env.MICROSOFT_CLIENT_SECRET),
    secret: Redacted.make(env.BETTER_AUTH_SECRET),
  });

  return {
    auth,
    domainHandler: createDomainRequestHandler(
      ApplicationLive.pipe(
        Layer.provide([
          Layer.succeed(BetterAuthServer, auth),
          Layer.succeed(CuratorStore, curatorStore),
          Layer.succeed(LibraryStore, libraryStore),
          FetchHttpClient.layer,
        ]),
      ),
    ),
  };
}).pipe(Effect.provide(PersistenceLive), Effect.runSync);

/** Handle a Better Auth protocol request. */
export function handleAuthRequest(request: Request): Promise<Response> {
  return runtime.auth.handler(request);
}

/** Handle a same-origin Throwback domain API request. */
export function handleDomainRequest(request: Request): Promise<Response> {
  return runtime.domainHandler(request);
}
