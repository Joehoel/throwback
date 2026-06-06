import { drizzle } from "drizzle-orm/d1";

import { env } from "#/env";
import { account, session, user, verification } from "./schema.ts";

const schema = {
  account,
  session,
  user,
  verification,
};

/** D1-backed Drizzle instance. The `DB` binding comes from alchemy.run.ts. */
export const db = drizzle(env.DB, { schema });
