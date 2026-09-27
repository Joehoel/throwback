import { Effect, Layer, Option } from "effect";
import { BetterAuthAccountId, MicrosoftAccountId } from "../curator/model.ts";
import { CuratorStore } from "../curator/curator-store.ts";
import { GraphReauthenticationRequired } from "./errors.ts";
import { indexGraphConnectionVersion } from "./library-index-test-support.ts";
import { PhotoHydrator } from "../photo/photo-hydrator.ts";
import { PhotoStore } from "../photo/photo-store.ts";

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

export const indexPhotoLayers = [
  Layer.succeed(PhotoStore, {
    activateHydratedGeneration: () => Effect.succeed(true),
    firstReviewablePhoto: () => Effect.die("unused"),
    getReviewablePhoto: () => Effect.die("unused"),
    nextStagedFile: () => Effect.succeed(Option.none()),
    stageHydratedFile: () => Effect.die("unused"),
  }),
  Layer.succeed(PhotoHydrator, { hydrate: () => Effect.die("unused") }),
] as const;

export function indexReauthenticationRequired(): GraphReauthenticationRequired {
  return new GraphReauthenticationRequired({ message: "Reconnect OneDrive" });
}
