/* eslint-disable import/no-namespace, typescript/no-unsafe-type-assertion */
import * as cf from "cloudflare:workers";

import type { WebsiteEnv } from "../alchemy.run.ts";

export const env = new Proxy({} as WebsiteEnv, {
  get(_, prop) {
    return cf.env[prop as keyof typeof cf.env];
  },
});
