import * as cloudflare from "cloudflare:workers";
import type { WebsiteEnv } from "../alchemy.run.ts";

// SAFETY: Alchemy's TanStack Start integration evaluates route modules outside
// Worker request context in development. The proxy defers each binding lookup
// until use while preserving the exact environment inferred from Website.
export const env = new Proxy({} as WebsiteEnv, {
  get(_, property) {
    // SAFETY: WebsiteEnv is generated from the same Alchemy Worker bindings;
    // the ambient Cloudflare Env declaration can lag until Alchemy regenerates it.
    return cloudflare.env[property as keyof typeof cloudflare.env];
  },
});
