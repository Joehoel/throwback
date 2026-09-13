import type { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions, ValidateUserInfoSource } from "better-auth";
import { betterAuth } from "better-auth";
import { Effect, Option, Redacted, Schema } from "effect";
import type { CuratorStoreService } from "../curator/curator-store.ts";
import { BetterAuthUserId, MicrosoftAccountId } from "../curator/model.ts";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const MicrosoftIdentityProfile = Schema.Struct({ oid: MicrosoftAccountId });

const MicrosoftDisplayProfile = Schema.Struct({
  oid: Schema.optionalKey(MicrosoftAccountId),
  email: Schema.optionalKey(Schema.NonEmptyString),
  preferred_username: Schema.optionalKey(Schema.NonEmptyString),
});

type MicrosoftDisplayProfile = typeof MicrosoftDisplayProfile.Type;

/** Runtime values needed to configure Better Auth for Throwback. */
export interface ThrowbackAuthConfiguration {
  readonly database: D1Database | DatabaseSync;
  readonly baseURL: string;
  readonly callbackURL: string;
  readonly secret: Redacted.Redacted;
  readonly microsoftClientId: string;
  readonly microsoftClientSecret: Redacted.Redacted;
  readonly curatorStore: CuratorStoreService;
}

function microsoftEmail(profile: Option.Option<MicrosoftDisplayProfile>): string {
  if (Option.isNone(profile)) {
    return "missing-identity@microsoft.placeholder.invalid";
  }

  if (profile.value.email !== undefined) {
    return profile.value.email;
  }

  if (profile.value.preferred_username !== undefined) {
    return profile.value.preferred_username;
  }

  return `${profile.value.oid ?? "missing-identity"}@microsoft.placeholder.invalid`;
}

/** Result Better Auth can use to reject a Microsoft identity before session issuance. */
export interface MicrosoftIdentityRejection {
  readonly error: string;
  readonly errorDescription: string;
}

/** Build the ownership gate run for every OAuth create, link, and returning sign-in. */
export function makeMicrosoftIdentityAdmission(curatorStore: CuratorStoreService) {
  return async (
    source: Pick<ValidateUserInfoSource, "oauth">,
  ): Promise<MicrosoftIdentityRejection | undefined> => {
    if (source.oauth?.providerId !== "microsoft") {
      return {
        error: "authentication_method_not_allowed",
        errorDescription: "Alleen het Microsoft-account van de Curator is toegestaan.",
      };
    }

    const providerAccountId = Schema.decodeUnknownOption(MicrosoftIdentityProfile)(
      source.oauth.profile,
    ).pipe(
      Option.map((identity) => identity.oid),
      Option.getOrUndefined,
    );

    if (providerAccountId === undefined) {
      return {
        error: "microsoft_identity_missing",
        errorDescription: "Microsoft heeft geen stabiele accountidentiteit teruggegeven.",
      };
    }

    const owner = await Effect.runPromise(curatorStore.getOwner);
    let rejection: MicrosoftIdentityRejection | undefined;

    if (Option.isSome(owner) && owner.value.providerAccountId !== providerAccountId) {
      rejection = {
        error: "curator_owner_mismatch",
        errorDescription: "Deze installatie is al door een ander Microsoft-account geclaimd.",
      };
    }

    return rejection;
  };
}

/** Create the pinned Better Auth options used by both runtime and configuration tests. */
export function makeThrowbackAuthOptions(configuration: ThrowbackAuthConfiguration) {
  const secureCookies = configuration.baseURL.startsWith("https://");
  const admitMicrosoftIdentity = makeMicrosoftIdentityAdmission(configuration.curatorStore);

  return {
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
      updateAccountOnSignIn: true,
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
      },
      useSecureCookies: secureCookies,
    },
    appName: "Throwback Beheer-webapp",
    basePath: "/api/auth",
    baseURL: configuration.baseURL,
    database: configuration.database,
    databaseHooks: {
      session: {
        create: {
          before: async (session: { readonly userId: string }) => {
            const owner = await Effect.runPromise(configuration.curatorStore.getOwner);
            let decision: false | undefined;

            if (Option.isSome(owner)) {
              const account = await Effect.runPromise(
                configuration.curatorStore.findMicrosoftAccount(
                  BetterAuthUserId.make(session.userId),
                ),
              );

              if (
                Option.isNone(account) ||
                account.value.providerAccountId !== owner.value.providerAccountId
              ) {
                decision = false;
              }
            }

            return decision;
          },
        },
      },
    },
    disabledPaths: ["/get-access-token", "/refresh-token"],
    secret: Redacted.value(configuration.secret),
    session: {
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    socialProviders: {
      microsoft: {
        clientId: configuration.microsoftClientId,
        clientSecret: Redacted.value(configuration.microsoftClientSecret),
        disableProfilePhoto: true,
        mapProfileToUser: (profile) => ({
          email: microsoftEmail(Schema.decodeUnknownOption(MicrosoftDisplayProfile)(profile)),
        }),
        prompt: "select_account",
        redirectURI: configuration.callbackURL,
        scope: ["Files.ReadWrite"],
        tenantId: "consumers",
      },
    },
    telemetry: { enabled: false },
    trustedOrigins: [configuration.baseURL],
    user: {
      validateUserInfo: ({ source }) => admitMicrosoftIdentity(source),
    },
  } satisfies BetterAuthOptions;
}

/** Create the Better Auth server mounted at `/api/auth/*`. */
export function createThrowbackAuth(configuration: ThrowbackAuthConfiguration) {
  return betterAuth(makeThrowbackAuthOptions(configuration));
}

/** Better Auth server type used by the application-session adapter. */
export type ThrowbackAuth = ReturnType<typeof createThrowbackAuth>;
