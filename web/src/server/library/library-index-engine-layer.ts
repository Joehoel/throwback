import { Layer } from "effect";
import type { Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createThrowbackAuth } from "../auth/auth.ts";
import { BetterAuthServer } from "../auth/better-auth-server.ts";
import type { CuratorStoreService } from "../curator/curator-store.ts";
import { GraphAccessTokenLive } from "../graph/graph-token.ts";
import { MicrosoftGraphApiLive } from "../graph/microsoft-graph-api.ts";
import { LibraryIndexEngineLive } from "./library-index-engine.ts";
import { LibraryIndexStore } from "./library-index-store.ts";
import type { LibraryIndexStoreService } from "./library-index-store.ts";

export interface LibraryIndexRuntimeOptions {
  readonly database: D1Database;
  readonly betterAuthUrl: string;
  readonly callbackUrl: string;
  readonly microsoftClientId: string;
  readonly microsoftClientSecret: Redacted.Redacted;
  readonly betterAuthSecret: Redacted.Redacted;
}

/** Assemble the server-only Graph dependencies for one Workflow page execution. */
export function libraryIndexEngineLayer(
  options: LibraryIndexRuntimeOptions,
  curatorStore: CuratorStoreService,
  indexStore: LibraryIndexStoreService,
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

  const graphTokenLayer = GraphAccessTokenLive.pipe(
    Layer.provide(Layer.succeed(BetterAuthServer, auth)),
  );

  return LibraryIndexEngineLive.pipe(
    Layer.provide([
      Layer.succeed(LibraryIndexStore, indexStore),
      graphTokenLayer,
      MicrosoftGraphApiLive.pipe(Layer.provide(FetchHttpClient.layer)),
    ]),
  );
}
