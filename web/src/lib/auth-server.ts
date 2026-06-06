import { env } from "#/env";
import { createAuth } from "./auth.ts";

/**
 * Runtime better-auth instance, bound to the Worker's D1 binding + secrets. Import
 * this (not `auth.ts`) from server code — it touches `cloudflare:workers`, so it
 * only loads inside the Worker. better-auth talks to D1 natively (no drizzle).
 */
export const auth = createAuth({
  baseURL: env.BETTER_AUTH_URL,
  clientId: env.MICROSOFT_CLIENT_ID,
  clientSecret: env.MICROSOFT_CLIENT_SECRET,
  db: env.DB,
  secret: env.BETTER_AUTH_SECRET,
});
