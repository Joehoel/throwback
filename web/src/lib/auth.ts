import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DB } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

/**
 * Builds the better-auth instance.
 *
 * Kept as a factory (no `cloudflare:workers` import) so the better-auth CLI can
 * load it for schema generation in plain Node. At runtime, `auth-server.ts`
 * calls this with the D1-backed db + secrets from the Worker env.
 *
 * Microsoft provider: personal accounts (`tenantId: 'consumers'`). Default
 * scopes already include `openid profile email User.Read offline_access`; we add
 * `Files.ReadWrite` so we can write captions/rotations back to OneDrive. The
 * Graph access token is later retrieved via
 * `auth.api.getAccessToken({ body: { providerId: 'microsoft' } })`.
 */
export function createAuth(opts: {
  db: DB;
  clientId?: string;
  clientSecret?: string;
  secret?: string;
  baseURL?: string;
}): ReturnType<typeof betterAuth> {
  const { clientId, clientSecret } = opts;

  const options: BetterAuthOptions = {
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: drizzleAdapter(opts.db, { provider: "sqlite" }),
    ...(clientId !== undefined &&
      clientId !== "" && {
        socialProviders: {
          microsoft: {
            clientId,
            clientSecret: clientSecret ?? "",
            prompt: "select_account",
            scope: ["Files.ReadWrite"],
            tenantId: "consumers",
          },
        },
      }),
    plugins: [tanstackStartCookies()],
  };

  return betterAuth(options);
}

/**
 * No-secrets instance used only by `@better-auth/cli generate`. The adapter's
 * `DB` type is an index signature, so an empty object is a valid value — schema
 * generation only reads the provider, never runs a query.
 */
export const auth = createAuth({ db: {} });
