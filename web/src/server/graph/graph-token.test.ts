import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { GraphReauthenticationRequired } from "../library/errors.ts";
import { makeBetterAuthGraphAccessToken } from "./graph-token.ts";

const account = {
  userId: BetterAuthUserId.make("user-a"),
  betterAuthAccountId: BetterAuthAccountId.make("account-a"),
  identity: CuratorIdentity.make({
    providerId: "microsoft",
    providerAccountId: MicrosoftAccountId.make("owner-oid"),
  }),
  display: { provider: "microsoft" as const, name: "Curator", email: "curator@example.test" },
  hasGraphConnection: true,
};

describe("Better Auth Graph token authority", () => {
  it("selects the local Better Auth account and keeps the token redacted", async () => {
    let selection: unknown;

    const tokens = makeBetterAuthGraphAccessToken({
      getAccessToken: (options) => {
        selection = options;

        return Promise.resolve({
          accessToken: "synthetic-access-token",
          scopes: ["Files.ReadWrite", "offline_access"],
        });
      },
    });

    const token = await Effect.runPromise(tokens.get(account));

    expect(selection).toEqual({ body: { accountId: "account-a", userId: "user-a" } });
    expect(String(token)).not.toContain("synthetic-access-token");
    expect(Redacted.value(token)).toBe("synthetic-access-token");
  });

  it("requires same-account reauthentication after refresh failure", async () => {
    const tokens = makeBetterAuthGraphAccessToken({
      getAccessToken: () => Promise.reject(new Error("synthetic refresh failure")),
    });

    const error = await Effect.runPromise(tokens.get(account).pipe(Effect.flip));

    expect(error).toBeInstanceOf(GraphReauthenticationRequired);
    expect(error.message).not.toContain("synthetic refresh failure");
  });
});
