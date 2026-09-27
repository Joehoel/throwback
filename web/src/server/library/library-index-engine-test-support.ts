import { Effect, Layer, Option } from "effect";
import { BetterAuthAccountId, MicrosoftAccountId } from "../curator/model.ts";
import { CuratorStore } from "../curator/curator-store.ts";
import { GraphReauthenticationRequired } from "./errors.ts";
import { indexGraphConnectionVersion } from "./library-index-test-support.ts";

export * from "./library-index-test-support.ts";

export const indexCuratorStoreLayer = Layer.succeed(CuratorStore, {
  claim: () => Effect.die("unused"),
  findMicrosoftAccount: () =>
    Effect.succeed(
      Option.some({
        betterAuthAccountId: BetterAuthAccountId.make("account-a"),
        graphConnectionVersion: indexGraphConnectionVersion,
        providerAccountId: MicrosoftAccountId.make("owner-oid"),
        hasGraphConnection: true,
      }),
    ),
  getOwner: Effect.die("unused"),
});

export function indexReauthenticationRequired(): GraphReauthenticationRequired {
  return new GraphReauthenticationRequired({ message: "Reconnect OneDrive" });
}
