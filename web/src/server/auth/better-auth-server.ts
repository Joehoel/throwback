import { Context } from "effect";
import type { ThrowbackAuth } from "./auth.ts";

/** Runtime-provided Better Auth server used by server-only authentication adapters. */
export class BetterAuthServer extends Context.Service<BetterAuthServer, ThrowbackAuth>()(
  "throwback/auth/BetterAuthServer",
) {}
