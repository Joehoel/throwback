import { Context, Effect, Layer, Option } from "effect";
import type { SignedInMicrosoftAccount } from "../curator/model.ts";
import { MicrosoftGraph } from "../graph/microsoft-graph.ts";
import type { DriveItemId, FolderBrowserState, LibraryBoundary } from "./model.ts";
import { LibraryId } from "./model.ts";
import type {
  GraphReauthenticationRequired,
  InvalidLibrarySelection,
  LibraryStoreUnavailable,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
} from "./errors.ts";
import { LibraryAlreadySelected } from "./errors.ts";
import { LibraryStore } from "./library-store.ts";

type BrowseFoldersError =
  | GraphReauthenticationRequired
  | LibraryAlreadySelected
  | LibraryStoreUnavailable
  | OneDriveFolderNotFound
  | OneDriveUnavailable;

type SelectLibraryError =
  | GraphReauthenticationRequired
  | InvalidLibrarySelection
  | LibraryAlreadySelected
  | LibraryStoreUnavailable
  | OneDriveFolderNotFound
  | OneDriveUnavailable;

/** Application policy for browsing and explicitly selecting one Hoofdmap. */
export interface LibrarySetupService {
  readonly browseFolders: (
    account: SignedInMicrosoftAccount,
    parentFolderId: Option.Option<DriveItemId>,
  ) => Effect.Effect<FolderBrowserState, BrowseFoldersError>;
  readonly selectLibrary: (
    account: SignedInMicrosoftAccount,
    rootFolderId: DriveItemId,
  ) => Effect.Effect<LibraryBoundary, SelectLibraryError>;
}

/** Application policy for browsing and explicitly selecting one Hoofdmap. */
export class LibrarySetup extends Context.Service<LibrarySetup, LibrarySetupService>()(
  "throwback/library/LibrarySetup",
) {}

function alreadySelected(): LibraryAlreadySelected {
  return new LibraryAlreadySelected({
    message: "Een andere Hoofdmap vereist een expliciete Bibliotheekreset.",
  });
}

/** Compose Graph validation and atomic Bibliotheek persistence. */
export const LibrarySetupLive = Layer.effect(
  LibrarySetup,
  Effect.gen(function* () {
    const graph = yield* MicrosoftGraph;
    const store = yield* LibraryStore;

    const browseFolders = Effect.fn("LibrarySetup.browseFolders")(function* (
      account: SignedInMicrosoftAccount,
      parentFolderId: Option.Option<DriveItemId>,
    ) {
      const selected = yield* store.getSelected(account.identity);

      if (Option.isSome(selected)) {
        return yield* alreadySelected();
      }

      return yield* graph.browseFolders(account, parentFolderId);
    });

    const selectLibrary = Effect.fn("LibrarySetup.selectLibrary")(function* (
      account: SignedInMicrosoftAccount,
      rootFolderId: DriveItemId,
    ) {
      const existing = yield* store.getSelected(account.identity);

      if (Option.isSome(existing)) {
        if (existing.value.rootDriveItemId === rootFolderId) {
          return existing.value;
        }

        return yield* alreadySelected();
      }

      const root = yield* graph.resolveSelectableFolder(account, rootFolderId);

      const selected = yield* store.select({
        id: LibraryId.make(crypto.randomUUID()),
        curatorProviderAccountId: account.identity.providerAccountId,
        driveId: root.driveId,
        rootDriveItemId: root.itemId,
        root: root.root,
      });

      if (selected.rootDriveItemId !== rootFolderId) {
        return yield* alreadySelected();
      }

      return selected;
    });

    return LibrarySetup.of({ browseFolders, selectLibrary });
  }),
);
