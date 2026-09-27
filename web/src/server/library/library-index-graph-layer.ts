import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createThrowbackAuth } from "../auth/auth.ts";
import { BetterAuthServer } from "../auth/better-auth-server.ts";
import type { CuratorStoreService } from "../curator/curator-store.ts";
import { GraphAccessTokenLive } from "../graph/graph-token.ts";
import { MicrosoftGraphApiLive } from "../graph/microsoft-graph-api.ts";
import { MicrosoftGraphPhotoApiLive } from "../graph/microsoft-graph-photo-api.ts";
import { PhotoHydratorLive } from "../photo/photo-hydrator.ts";
import type { LibraryIndexRuntimeOptions } from "./library-index-runtime-options.ts";

/** Build the Graph and JPEG hydration dependencies for one index Workflow runtime. */
export function libraryIndexGraphLayer(
  options: LibraryIndexRuntimeOptions,
  curatorStore: CuratorStoreService,
) {
  const auth = createThrowbackAuth({
    baseURL: options.betterAuthUrl,
    callbackURL: options.callbackUrl,
    curatorStore,
    database: options.database,
    microsoftClientId: options.microsoftClientId,
    microsoftClientSecret: options.microsoftClientSecret,
    secret: options.betterAuthSecret,
  });

  return Layer.mergeAll(
    GraphAccessTokenLive.pipe(Layer.provide(Layer.succeed(BetterAuthServer, auth))),
    MicrosoftGraphApiLive.pipe(Layer.provide(FetchHttpClient.layer)),
    PhotoHydratorLive.pipe(
      Layer.provide(MicrosoftGraphPhotoApiLive.pipe(Layer.provide(FetchHttpClient.layer))),
    ),
  );
}
