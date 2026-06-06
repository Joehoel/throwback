import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./schema.ts";

const schema = {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};

/** D1-backed Drizzle instance. The `DB` binding comes from wrangler.jsonc. */
export const db = drizzle(env.DB, { schema });
