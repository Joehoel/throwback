import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { BetterAuthServer } from "../auth/better-auth-server.ts";
import type { BetterAuthAccountId, BetterAuthUserId } from "../curator/model.ts";
import { GraphReauthenticationRequired } from "../library/errors.ts";

const BetterAuthTokenResult = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  scopes: Schema.Array(Schema.String),
});

type BetterAuthTokenResult = typeof BetterAuthTokenResult.Type;

/** Stable server-side Better Auth account coordinates required to resolve a delegated token. */
export interface GraphTokenAccount {
  readonly userId: BetterAuthUserId;
  readonly betterAuthAccountId: BetterAuthAccountId;
}

/** Server-only authority for a current delegated Microsoft Graph token. */
export interface GraphAccessTokenService {
  readonly get: (
    account: GraphTokenAccount,
  ) => Effect.Effect<Redacted.Redacted, GraphReauthenticationRequired>;
}

/** Server-only authority for a current delegated Microsoft Graph token. */
export class GraphAccessToken extends Context.Service<GraphAccessToken, GraphAccessTokenService>()(
  "throwback/graph/GraphAccessToken",
) {}

/** Narrow Better Auth server API used to decrypt and refresh Graph credentials. */
export interface BetterAuthTokenApi {
  readonly getAccessToken: (options: {
    readonly body: {
      readonly accountId: string;
      readonly userId: string;
    };
  }) => Promise<BetterAuthTokenResult>;
}

function reauthenticationRequired(): GraphReauthenticationRequired {
  return new GraphReauthenticationRequired({
    message: "Verbind OneDrive opnieuw met hetzelfde Microsoft-account.",
  });
}

/** Build a token authority from Better Auth's non-HTTP server API. */
export function makeBetterAuthGraphAccessToken(api: BetterAuthTokenApi): GraphAccessTokenService {
  const get = Effect.fn("GraphAccessToken.get")(function* (account: GraphTokenAccount) {
    const tokenResult = yield* Effect.tryPromise({
      try: () =>
        api.getAccessToken({
          body: {
            accountId: account.betterAuthAccountId,
            userId: account.userId,
          },
        }),
      catch: reauthenticationRequired,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(BetterAuthTokenResult)),
      Effect.mapError(reauthenticationRequired),
    );

    if (!tokenResult.scopes.includes("Files.ReadWrite")) {
      return yield* reauthenticationRequired();
    }

    return Redacted.make(tokenResult.accessToken);
  });

  return GraphAccessToken.of({ get });
}

/** Graph token authority requiring the runtime Better Auth server. */
export const GraphAccessTokenLive = Layer.effect(
  GraphAccessToken,
  Effect.gen(function* () {
    const auth = yield* BetterAuthServer;

    return makeBetterAuthGraphAccessToken(auth.api);
  }),
);
