import type { Redacted } from "effect";

/** Runtime resources and server-only credentials available to one index Workflow step. */
export interface LibraryIndexRuntimeOptions {
  readonly database: D1Database;
  readonly betterAuthUrl: string;
  readonly callbackUrl: string;
  readonly microsoftClientId: string;
  readonly microsoftClientSecret: Redacted.Redacted;
  readonly betterAuthSecret: Redacted.Redacted;
}
