import { Context } from "effect";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import type { SignedInMicrosoftAccount as SignedInMicrosoftAccountValue } from "../curator/model.ts";
import { AuthenticationRequired, CuratorAccessUnavailable } from "../curator/errors.ts";

/** Request-scoped Microsoft identity supplied after Better Auth session validation. */
export class SignedInMicrosoftAccount extends Context.Service<
  SignedInMicrosoftAccount,
  SignedInMicrosoftAccountValue
>()("throwback/api/SignedInMicrosoftAccount") {}

/** Better Auth session middleware for operations allowed before the one-time claim. */
export class SignedInSessionAuthorization extends HttpApiMiddleware.Service<
  SignedInSessionAuthorization,
  { provides: SignedInMicrosoftAccount }
>()("throwback/api/SignedInSessionAuthorization", {
  error: [AuthenticationRequired, CuratorAccessUnavailable],
}) {}
