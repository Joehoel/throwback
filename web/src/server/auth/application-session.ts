import { Context, Effect, Layer, Option, Schema } from "effect";
import type { ThrowbackAuth } from "./auth.ts";
import { BetterAuthServer } from "./better-auth-server.ts";

/** A Better Auth session after an authoritative D1-backed lookup. */
export interface ApplicationSessionValue {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
}

/** Failure to resolve the application session from Better Auth. */
export class ApplicationSessionError extends Schema.TaggedError<ApplicationSessionError>()(
  "ApplicationSessionError",
  { message: Schema.String },
) {}

/** Authority for resolving the Better Auth session attached to request headers. */
export interface ApplicationSessionService {
  readonly get: (
    headers: Headers,
  ) => Effect.Effect<Option.Option<ApplicationSessionValue>, ApplicationSessionError>;
}

/** Authority for resolving the Better Auth session attached to request headers. */
export class ApplicationSession extends Context.Service<
  ApplicationSession,
  ApplicationSessionService
>()("throwback/auth/ApplicationSession") {}

/** Build the Better Auth-backed application-session implementation. */
export function makeBetterAuthApplicationSession(auth: ThrowbackAuth): ApplicationSessionService {
  const get = Effect.fn("ApplicationSession.get")(function* (headers: Headers) {
    const session = yield* Effect.tryPromise({
      try: () =>
        auth.api.getSession({
          headers,
          query: { disableCookieCache: true },
        }),
      catch: () =>
        new ApplicationSessionError({
          message: "De beveiligde sessie kon niet worden gecontroleerd.",
        }),
    });

    return Option.fromNullishOr(session);
  });

  return ApplicationSession.of({ get });
}

/** Application-session implementation requiring the runtime Better Auth server. */
export const ApplicationSessionLive = Layer.effect(
  ApplicationSession,
  Effect.gen(function* () {
    const auth = yield* BetterAuthServer;

    return makeBetterAuthApplicationSession(auth);
  }),
);
