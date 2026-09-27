import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createDomainRequestHandler } from "./api/handler.ts";
import { ApplicationLive } from "./application-layer.ts";
import { BetterAuthServer } from "./auth/better-auth-server.ts";
import { createRuntimeAuth } from "./auth/runtime-auth.ts";
import { CuratorStore } from "./curator/curator-store.ts";
import {
  LibraryIndex,
  LibraryIndexApplicationLive,
} from "./library/library-index-application-layer.ts";
import { LibraryStore } from "./library/library-store.ts";
import { PersistenceLive } from "./persistence-layer.ts";

const runtime = Effect.gen(function* () {
  const curatorStore = yield* CuratorStore;
  const libraryStore = yield* LibraryStore;
  const libraryIndex = yield* LibraryIndex.pipe(Effect.provide(LibraryIndexApplicationLive));

  const auth = createRuntimeAuth(curatorStore);

  return {
    auth,
    domainHandler: createDomainRequestHandler(
      ApplicationLive.pipe(
        Layer.provide([
          Layer.succeed(BetterAuthServer, auth),
          Layer.succeed(CuratorStore, curatorStore),
          Layer.succeed(LibraryStore, libraryStore),
          Layer.succeed(LibraryIndex, libraryIndex),
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
