import { env } from 'cloudflare:workers'

import { db } from '#/db'
import { createAuth } from './auth.ts'

/**
 * Runtime better-auth instance, bound to the Worker's D1 + secrets. Import this
 * (not `auth.ts`) from server code — it touches `cloudflare:workers`, so it only
 * loads inside the Worker, never in the better-auth CLI.
 */
export const auth = createAuth({
  db,
  clientId: env.MICROSOFT_CLIENT_ID,
  clientSecret: env.MICROSOFT_CLIENT_SECRET,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
