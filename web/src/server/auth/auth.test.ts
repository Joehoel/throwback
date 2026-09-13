import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, Option, Redacted, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { CuratorStoreService } from "../curator/curator-store.ts";
import { CuratorIdentity, MicrosoftAccountId } from "../curator/model.ts";
import {
  createThrowbackAuth,
  makeMicrosoftIdentityAdmission,
  makeThrowbackAuthOptions,
} from "./auth.ts";

const migrationPath = fileURLToPath(
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
);

function makeStore(ownerId?: string, accountId?: string): CuratorStoreService {
  const owner = Option.fromNullishOr(ownerId).pipe(
    Option.map((providerAccountId) =>
      CuratorIdentity.make({
        providerId: "microsoft",
        providerAccountId: MicrosoftAccountId.make(providerAccountId),
      }),
    ),
  );

  const account = Option.fromNullishOr(accountId).pipe(
    Option.map((providerAccountId) => ({
      providerAccountId: MicrosoftAccountId.make(providerAccountId),
      hasGraphConnection: true,
    })),
  );

  return {
    claim: (identity) => Effect.succeed(Option.getOrElse(owner, () => identity)),
    findMicrosoftAccount: () => Effect.succeed(account),
    getOwner: Effect.succeed(owner),
  };
}

describe("Throwback Better Auth configuration", () => {
  it("uses encrypted Microsoft tokens and rolling 30-day D1-backed sessions", () => {
    const options = makeThrowbackAuthOptions({
      baseURL: "https://curation-preview.kuijper.fyi",
      callbackURL: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      curatorStore: makeStore(),
      database: new DatabaseSync(":memory:"),
      microsoftClientId: "client-id",
      microsoftClientSecret: Redacted.make("client-secret"),
      secret: Redacted.make("better-auth-secret-with-at-least-32-characters"),
    });

    expect(options.session).toEqual({ expiresIn: 2_592_000, updateAge: 86_400 });
    expect(options.account.encryptOAuthTokens).toBe(true);
    expect(options.account.accountLinking.enabled).toBe(false);
    expect(options.advanced.defaultCookieAttributes).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    expect(options.socialProviders.microsoft).toMatchObject({
      clientId: "client-id",
      redirectURI: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      scope: ["Files.ReadWrite"],
      tenantId: "consumers",
    });
  });

  it("allows candidates only before claim and rejects a different oid afterwards", async () => {
    const beforeClaim = makeMicrosoftIdentityAdmission(makeStore());
    const afterClaim = makeMicrosoftIdentityAdmission(makeStore("owner-oid"));

    await expect(
      beforeClaim({ oauth: { providerId: "microsoft", profile: { oid: "candidate-oid" } } }),
    ).resolves.toBeUndefined();
    await expect(
      afterClaim({ oauth: { providerId: "microsoft", profile: { oid: "owner-oid" } } }),
    ).resolves.toBeUndefined();
    await expect(
      afterClaim({ oauth: { providerId: "microsoft", profile: { oid: "other-oid" } } }),
    ).resolves.toMatchObject({ error: "curator_owner_mismatch" });
  });

  it("fails closed without a Microsoft oid or through another auth method", async () => {
    const admit = makeMicrosoftIdentityAdmission(makeStore());

    await expect(admit({ oauth: { providerId: "microsoft", profile: {} } })).resolves.toMatchObject(
      { error: "microsoft_identity_missing" },
    );
    await expect(admit({ oauth: { providerId: "github" } })).resolves.toMatchObject({
      error: "authentication_method_not_allowed",
    });
  });

  it("blocks session creation when the linked Microsoft account is not the owner", async () => {
    const options = makeThrowbackAuthOptions({
      baseURL: "https://curation-preview.kuijper.fyi",
      callbackURL: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      curatorStore: makeStore("owner-oid"),
      database: new DatabaseSync(":memory:"),
      microsoftClientId: "client-id",
      microsoftClientSecret: Redacted.make("client-secret"),
      secret: Redacted.make("better-auth-secret-with-at-least-32-characters"),
    });

    await expect(
      options.databaseHooks.session.create.before({ userId: "other-user" }),
    ).resolves.toBe(false);
  });

  it("allows session creation only when the linked Microsoft account is the owner", async () => {
    const options = makeThrowbackAuthOptions({
      baseURL: "https://curation-preview.kuijper.fyi",
      callbackURL: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      curatorStore: makeStore("owner-oid", "owner-oid"),
      database: new DatabaseSync(":memory:"),
      microsoftClientId: "client-id",
      microsoftClientSecret: Redacted.make("client-secret"),
      secret: Redacted.make("better-auth-secret-with-at-least-32-characters"),
    });

    await expect(
      options.databaseHooks.session.create.before({ userId: "owner-user" }),
    ).resolves.toBeUndefined();
  });

  it("starts a same-origin consumers OAuth flow with the delegated Graph scope", async () => {
    const database = new DatabaseSync(":memory:");

    database.exec(readFileSync(migrationPath, "utf8"));

    const auth = createThrowbackAuth({
      baseURL: "https://curation-preview.kuijper.fyi",
      callbackURL: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      curatorStore: makeStore(),
      database,
      microsoftClientId: "client-id",
      microsoftClientSecret: Redacted.make("client-secret"),
      secret: Redacted.make("better-auth-secret-with-at-least-32-characters"),
    });

    const response = await auth.handler(
      new Request("https://curation-preview.kuijper.fyi/api/auth/sign-in/social", {
        body: JSON.stringify({ callbackURL: "/", provider: "microsoft" }),
        headers: {
          "content-type": "application/json",
          origin: "https://curation-preview.kuijper.fyi",
        },
        method: "POST",
      }),
    );

    const body = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
      await response.json(),
    );

    const authorizationUrl = new URL(body.url);

    expect(response.status).toBe(200);
    expect(authorizationUrl.pathname).toBe("/consumers/oauth2/v2.0/authorize");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
    );
    expect(authorizationUrl.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "profile",
        "email",
        "User.Read",
        "offline_access",
        "Files.ReadWrite",
      ]),
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("never exposes delegated OAuth tokens through browser-facing auth routes", async () => {
    const database = new DatabaseSync(":memory:");

    database.exec(readFileSync(migrationPath, "utf8"));

    const auth = createThrowbackAuth({
      baseURL: "https://curation-preview.kuijper.fyi",
      callbackURL: "https://curation-preview.kuijper.fyi/api/auth/callback/microsoft",
      curatorStore: makeStore(),
      database,
      microsoftClientId: "client-id",
      microsoftClientSecret: Redacted.make("client-secret"),
      secret: Redacted.make("better-auth-secret-with-at-least-32-characters"),
    });

    for (const path of ["get-access-token", "refresh-token"]) {
      const response = await auth.handler(
        new Request(`https://curation-preview.kuijper.fyi/api/auth/${path}`, {
          headers: { origin: "https://curation-preview.kuijper.fyi" },
          method: "POST",
        }),
      );

      expect(response.status).toBe(404);
    }
  });
});
