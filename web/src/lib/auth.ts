import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { D1Database } from "@cloudflare/workers-types";

/**
 * Builds the better-auth instance on **native D1** — no drizzle.
 *
 * better-auth detects a `D1Database` and uses its built-in Kysely D1 dialect
 * (verified in `web/spike/sql-d1/` Part D). The auth tables live as plain SQL in
 * `./drizzle/*.sql`, applied to D1 by Alchemy (`alchemy.run.ts` `migrationsDir`).
 * Regenerate that SQL when the better-auth schema changes via `getMigrations()`
 * (`better-auth/db/migration`) against a local/miniflare D1 — see the spike.
 *
 * Microsoft provider: personal accounts (`tenantId: 'consumers'`). Default scopes
 * already include `openid profile email User.Read offline_access`; we add
 * `Files.ReadWrite` to write captions/rotations back to OneDrive. The Graph access
 * token is later retrieved via
 * `auth.api.getAccessToken({ body: { providerId: 'microsoft' } })`.
 */
export function createAuth(opts: {
  db: D1Database;
  clientId?: string;
  clientSecret?: string;
  secret?: string;
  baseURL?: string;
}): ReturnType<typeof betterAuth> {
  const { clientId, clientSecret } = opts;

  const options: BetterAuthOptions = {
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: opts.db,
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
