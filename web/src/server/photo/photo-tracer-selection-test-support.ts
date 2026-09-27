import { Effect, Layer, Option } from "effect";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  GraphConnectionVersion,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { MicrosoftGraph } from "../graph/microsoft-graph.ts";
import { LibraryIndex } from "../library/library-index.ts";
import { LibrarySetup, LibrarySetupLive } from "../library/library-setup.ts";
import { LibraryStore } from "../library/library-store.ts";
import { DriveId, DriveItemId } from "../library/model.ts";

const account = {
  userId: BetterAuthUserId.make("user-a"),
  betterAuthAccountId: BetterAuthAccountId.make("account-a"),
  graphConnectionVersion: GraphConnectionVersion.make("connection-v1"),
  identity: CuratorIdentity.make({
    providerId: "microsoft",
    providerAccountId: MicrosoftAccountId.make("owner-oid"),
  }),
  display: { provider: "microsoft" as const, name: "Curator", email: "curator@example.test" },
  hasGraphConnection: true,
};

/** Select the tracer Hoofdmap through the real Bibliotheek setup policy. */
export const selectPhotoTracerLibrary = Effect.gen(function* () {
  const store = yield* LibraryStore;

  const setupLayer = LibrarySetupLive.pipe(
    Layer.provide([
      Layer.succeed(MicrosoftGraph, {
        browseFolders: () => Effect.die("unused"),
        resolveSelectableFolder: () =>
          Effect.succeed({
            driveId: DriveId.make("drive-a"),
            itemId: DriveItemId.make("selected-root"),
            root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
          }),
      }),
      Layer.succeed(LibraryStore, store),
      Layer.succeed(LibraryIndex, {
        getProgress: () => Effect.succeed(Option.none()),
        startOrResume: () =>
          Effect.succeed({
            status: "queued" as const,
            pagesProcessed: 0,
            processedItems: 0,
            reviewBlocked: true,
          }),
      }),
    ]),
  );

  return yield* LibrarySetup.pipe(
    Effect.flatMap((setup) => setup.selectLibrary(account, DriveItemId.make("selected-root"))),
    Effect.provide(setupLayer),
  );
});
