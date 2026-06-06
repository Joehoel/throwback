import { Context } from "effect";
import type { Effect } from "effect";
import type { TokenUnavailable } from "#/domain/errors.ts";
import type { UserId } from "#/domain/ids.ts";

/**
 * Microsoft Graph access-token source. Abstracted as a service so the HTTP client
 * stays decoupled from better-auth + `cloudflare:workers` (ADR-0011: the token is
 * fetched sessionless, just from a `userId`). The live, better-auth-backed layer
 * lives in `token-live.ts` (Worker-only); tests provide a stub.
 */
export class GraphToken extends Context.Service<GraphToken, {
  readonly forUser: (userId: UserId) => Effect.Effect<string, TokenUnavailable>;
}>()("GraphToken") {}

/**
 * The authenticated user for the current request/operation. Request-scoped, so it
 * lives in the requirements (R), provided at the boundary: oRPC sets it from the
 * better-auth session, the write-path Workflow sets it from its `userId` param
 * (ADR-0011). The HTTP client reads it to attach the right user's bearer token.
 */
export class CurrentUser extends Context.Service<CurrentUser, UserId>()("CurrentUser") {}
