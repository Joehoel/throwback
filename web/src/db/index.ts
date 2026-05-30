import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

/** D1-backed Drizzle instance. The `DB` binding comes from wrangler.jsonc. */
export const db = drizzle(env.DB, { schema })
