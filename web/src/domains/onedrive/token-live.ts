import { Effect, Layer } from "effect";
import { TokenUnavailable } from "#/domains/shared/errors.ts";
import type { UserId } from "#/domains/shared/ids.ts";
import { auth } from "#/lib/auth-server.ts";
import { GraphToken } from "./token.ts";

/**
 * Live `GraphToken` — better-auth's `getAccessToken` works sessionless (just a
 * `userId`, no request headers) and refreshes the Microsoft token itself
 * (ADR-0011). Worker-only: imports `#/lib/auth-server` (→ `cloudflare:workers`).
 */
export const GraphTokenLive: Layer.Layer<GraphToken> = Layer.succeed(
  GraphToken,
  GraphToken.of({
    forUser: (userId: UserId) =>
      Effect.tryPromise({
        try: async () => {
          const { internalAdapter } = await auth.$context;
          const accounts = await internalAdapter.findAccounts(userId);

          const microsoftAccount = accounts.find((account) => account.providerId === "microsoft");

          if (microsoftAccount === undefined) {
            throw new Error("Microsoft account not found");
          }

          return auth.api.getAccessToken({ body: { accountId: microsoftAccount.id, userId } });
        },
        catch: () => new TokenUnavailable({ userId }),
      }).pipe(
        Effect.flatMap((res) =>
          res.accessToken
            ? Effect.succeed(res.accessToken)
            : Effect.fail(new TokenUnavailable({ userId })),
        ),
      ),
  }),
);
