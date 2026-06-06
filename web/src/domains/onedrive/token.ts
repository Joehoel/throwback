import { Context } from 'effect';
import type { Effect } from 'effect';
import type { TokenUnavailable } from "#/domain/errors.ts";
import type { UserId } from "#/domain/ids.ts";

/**
 * Microsoft Graph access-token source for the OneDrive client. Abstracted as a
 * service so `client.ts` stays decoupled from better-auth + `cloudflare:workers`
 * (ADR-0011: the token is fetched sessionless, just from a `userId`). The live,
 * better-auth-backed layer lives in `token-live.ts` (Worker-only); tests provide
 * a stub.
 */
export class GraphToken extends Context.Service<GraphToken, {
  readonly forUser: (userId: UserId) => Effect.Effect<string, TokenUnavailable>;
}>()("GraphToken") {}
