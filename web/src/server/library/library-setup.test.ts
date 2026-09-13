import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { MicrosoftGraph } from "../graph/microsoft-graph.ts";
import { LibraryAlreadySelected } from "./errors.ts";
import { LibrarySetup, LibrarySetupLive } from "./library-setup.ts";
import { LibraryStore } from "./library-store.ts";
import { DriveId, DriveItemId } from "./model.ts";
import type { LibraryBoundary } from "./model.ts";

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

function setupLayer() {
  let selected = Option.none<LibraryBoundary>();
  let graphSelections = 0;

  const layer = LibrarySetupLive.pipe(
    Layer.provide([
      Layer.succeed(MicrosoftGraph, {
        browseFolders: () =>
          Effect.succeed({
            current: {
              id: DriveItemId.make("root"),
              name: "OneDrive",
              path: "OneDrive",
              isDriveRoot: true,
            },
            folders: [],
          }),
        resolveSelectableFolder: (_account, folderId) => {
          graphSelections += 1;

          return Effect.succeed({
            driveId: DriveId.make("drive-a"),
            itemId: folderId,
            root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
          });
        },
      }),
      Layer.succeed(LibraryStore, {
        getSelected: () => Effect.sync(() => selected),
        select: (selection) =>
          Effect.sync(() => {
            if (Option.isNone(selected)) {
              selected = Option.some(selection);
            }

            return Option.getOrThrow(selected);
          }),
      }),
    ]),
  );

  return { graphSelections: () => graphSelections, layer };
}

describe("Bibliotheek selection policy", () => {
  it("makes repeated confirmation of the same Hoofdmap idempotent", async () => {
    const test = setupLayer();
    const rootFolderId = DriveItemId.make("folder-a");

    const selections = await Effect.runPromise(
      LibrarySetup.pipe(
        Effect.flatMap((setup) =>
          setup
            .selectLibrary(account, rootFolderId)
            .pipe(Effect.flatMap(() => setup.selectLibrary(account, rootFolderId))),
        ),
        Effect.provide(test.layer),
      ),
    );

    expect(selections.rootDriveItemId).toBe(rootFolderId);
    expect(test.graphSelections()).toBe(1);
  });

  it("rejects a different Hoofdmap after selection", async () => {
    const test = setupLayer();

    const error = await Effect.runPromise(
      LibrarySetup.pipe(
        Effect.flatMap((setup) =>
          setup
            .selectLibrary(account, DriveItemId.make("folder-a"))
            .pipe(Effect.andThen(setup.selectLibrary(account, DriveItemId.make("folder-b")))),
        ),
        Effect.provide(test.layer),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(LibraryAlreadySelected);
    expect(error.message).toContain("Bibliotheekreset");
  });
});
