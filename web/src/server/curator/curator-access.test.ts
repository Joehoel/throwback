import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { ApplicationSession } from "../auth/application-session.ts";
import { CuratorAccess, CuratorAccessLive } from "./curator-access.ts";
import { CuratorOwnershipConflict } from "./errors.ts";
import { CuratorIdentity, MicrosoftAccountId } from "./model.ts";
import { CuratorStore } from "./curator-store.ts";

function accessLayer(accountId: string, ownerId: string): Layer.Layer<CuratorAccess> {
  const owner = CuratorIdentity.make({
    providerId: "microsoft",
    providerAccountId: MicrosoftAccountId.make(ownerId),
  });

  return CuratorAccessLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ApplicationSession, {
          get: () =>
            Effect.succeed(
              Option.some({
                user: { id: "user-a", name: "Curator", email: "curator@example.test" },
              }),
            ),
        }),
        Layer.succeed(CuratorStore, {
          claim: () => Effect.succeed(owner),
          findMicrosoftAccount: () =>
            Effect.succeed(
              Option.some({
                providerAccountId: MicrosoftAccountId.make(accountId),
                hasGraphConnection: true,
              }),
            ),
          getOwner: Effect.succeed(Option.some(owner)),
        }),
      ),
    ),
  );
}

function requireCurator(accountId: string, ownerId: string) {
  return CuratorAccess.pipe(
    Effect.flatMap((access) => access.requireCurator(new Headers())),
    Effect.provide(accessLayer(accountId, ownerId)),
  );
}

describe("Curator access policy", () => {
  it("authorizes a protected operation only for the claimed provider identity", async () => {
    const account = await Effect.runPromise(requireCurator("owner-oid", "owner-oid"));

    expect(account.identity.providerAccountId).toBe(MicrosoftAccountId.make("owner-oid"));
  });

  it("rejects a valid session belonging to another Microsoft account", async () => {
    const error = await Effect.runPromise(
      requireCurator("other-oid", "owner-oid").pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(CuratorOwnershipConflict);
  });
});
