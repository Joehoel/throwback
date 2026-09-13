import { Context, Effect, Layer, Option } from "effect";
import type { SignedInMicrosoftAccount } from "../curator/model.ts";
import type { GraphReauthenticationRequired, OneDriveUnavailable } from "../library/errors.ts";
import { InvalidLibrarySelection, OneDriveFolderNotFound } from "../library/errors.ts";
import type {
  DriveId,
  DriveItemId,
  FolderBrowserState,
  LibraryRootDisplay,
} from "../library/model.ts";
import { GraphAccessToken } from "./graph-token.ts";
import type { GraphFolder } from "./microsoft-graph-api.ts";
import { MicrosoftGraphApi } from "./microsoft-graph-api.ts";

/** A Graph-proven folder ready for Bibliotheek selection. */
export interface ResolvedGraphFolder {
  readonly driveId: DriveId;
  readonly itemId: DriveItemId;
  readonly root: LibraryRootDisplay;
}

/** Server-side OneDrive folder operations bound to the current Curator account. */
export interface MicrosoftGraphService {
  readonly browseFolders: (
    account: SignedInMicrosoftAccount,
    parentFolderId: Option.Option<DriveItemId>,
  ) => Effect.Effect<
    FolderBrowserState,
    GraphReauthenticationRequired | OneDriveFolderNotFound | OneDriveUnavailable
  >;
  readonly resolveSelectableFolder: (
    account: SignedInMicrosoftAccount,
    folderId: DriveItemId,
  ) => Effect.Effect<
    ResolvedGraphFolder,
    | GraphReauthenticationRequired
    | InvalidLibrarySelection
    | OneDriveFolderNotFound
    | OneDriveUnavailable
  >;
}

/** Server-side OneDrive folder operations bound to the current Curator account. */
export class MicrosoftGraph extends Context.Service<MicrosoftGraph, MicrosoftGraphService>()(
  "throwback/graph/MicrosoftGraph",
) {}

function folderNotFound(): OneDriveFolderNotFound {
  return new OneDriveFolderNotFound({
    message: "Deze OneDrive-map bestaat niet meer of is niet bereikbaar.",
  });
}

function invalidSelection(): InvalidLibrarySelection {
  return new InvalidLibrarySelection({
    message: "Kies een gewone map binnen OneDrive als Hoofdmap.",
  });
}

function displayPath(folder: GraphFolder, isDriveRoot: boolean): string {
  if (isDriveRoot) {
    return "OneDrive";
  }

  const relativeParent = Option.match(folder.parentPath, {
    onNone: () => "",
    onSome: (path) =>
      path
        .split("root:")
        .at(1)
        ?.replaceAll(/^\/+|\/+$/gu, "") ?? "",
  });

  return ["OneDrive", relativeParent, folder.name]
    .filter((segment) => segment.length > 0)
    .join(" / ");
}

/** Compose Graph tokens and typed Graph HTTP operations into Bibliotheek folder policy. */
export const MicrosoftGraphLive = Layer.effect(
  MicrosoftGraph,
  Effect.gen(function* () {
    const accessTokens = yield* GraphAccessToken;
    const graphApi = yield* MicrosoftGraphApi;

    const browseFolders = Effect.fn("MicrosoftGraph.browseFolders")(function* (
      account: SignedInMicrosoftAccount,
      parentFolderId: Option.Option<DriveItemId>,
    ) {
      const token = yield* accessTokens.get(account);
      const driveId = yield* graphApi.getDefaultDrive(token);

      const current = yield* graphApi
        .getFolder(token, driveId, parentFolderId)
        .pipe(Effect.catchTag("GraphItemNotFolder", folderNotFound));

      const isDriveRoot = Option.isNone(parentFolderId);
      const childFolders = yield* graphApi.listChildFolders(token, driveId, current.id);

      const location = {
        id: current.id,
        name: current.name,
        path: displayPath(current, isDriveRoot),
        isDriveRoot,
      };

      return {
        current: Option.match(current.parentFolderId, {
          onNone: () => location,
          onSome: (folderParentId) => ({ ...location, parentFolderId: folderParentId }),
        }),
        folders: childFolders,
      };
    });

    const resolveSelectableFolder = Effect.fn("MicrosoftGraph.resolveSelectableFolder")(function* (
      account: SignedInMicrosoftAccount,
      folderId: DriveItemId,
    ) {
      const token = yield* accessTokens.get(account);
      const driveId = yield* graphApi.getDefaultDrive(token);

      const driveRoot = yield* graphApi
        .getFolder(token, driveId, Option.none())
        .pipe(Effect.catchTag("GraphItemNotFolder", folderNotFound));

      const folder = yield* graphApi
        .getFolder(token, driveId, Option.some(folderId))
        .pipe(Effect.catchTag("GraphItemNotFolder", invalidSelection));

      if (folder.id === driveRoot.id) {
        return yield* invalidSelection();
      }

      return {
        driveId,
        itemId: folder.id,
        root: {
          name: folder.name,
          path: displayPath(folder, false),
        },
      };
    });

    return MicrosoftGraph.of({ browseFolders, resolveSelectableFolder });
  }),
);
