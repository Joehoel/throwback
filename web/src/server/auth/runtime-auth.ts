import { env } from "cloudflare:workers";
import { Redacted } from "effect";
import { createThrowbackAuth } from "./auth.ts";
import type { CuratorStoreService } from "../curator/curator-store.ts";

/** Build Better Auth from validated Cloudflare bindings and the Curator authority. */
export function createRuntimeAuth(curatorStore: CuratorStoreService) {
  return createThrowbackAuth({
    baseURL: env.BETTER_AUTH_URL,
    callbackURL: env.MICROSOFT_CALLBACK_URL,
    curatorStore,
    database: env.DB,
    microsoftClientId: env.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: Redacted.make(env.MICROSOFT_CLIENT_SECRET),
    secret: Redacted.make(env.BETTER_AUTH_SECRET),
  });
}
