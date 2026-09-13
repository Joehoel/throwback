import { Schema } from "effect";
import { MicrosoftAccountId } from "../curator/model.ts";

/** D1 identity for one selected Bibliotheek. */
export const LibraryId = Schema.String.check(Schema.isUUID(4))
  .pipe(Schema.brand("LibraryId"))
  .annotate({
    format: "throwback-library-id",
    identifier: "LibraryId",
  });

/** D1 identity for one selected Bibliotheek. */
export type LibraryId = typeof LibraryId.Type;

/** Microsoft Graph identity for a OneDrive. */
export const DriveId = Schema.NonEmptyString.pipe(Schema.brand("DriveId"));

/** Microsoft Graph identity for a OneDrive. */
export type DriveId = typeof DriveId.Type;

/** Microsoft Graph identity for an item in a OneDrive. */
export const DriveItemId = Schema.NonEmptyString.pipe(Schema.brand("DriveItemId")).annotate({
  format: "throwback-drive-item-id",
  identifier: "DriveItemId",
});

/** Microsoft Graph identity for an item in a OneDrive. */
export type DriveItemId = typeof DriveItemId.Type;

/** A folder that can be opened in the Hoofdmap picker. */
export const SelectableFolder = Schema.Struct({
  id: DriveItemId,
  name: Schema.NonEmptyString,
  childCount: Schema.Finite,
}).annotate({ identifier: "SelectableFolder" });

/** A folder that can be opened in the Hoofdmap picker. */
export type SelectableFolder = typeof SelectableFolder.Type;

/** Current OneDrive location shown by the folder picker. */
export const FolderLocation = Schema.Struct({
  id: DriveItemId,
  name: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  isDriveRoot: Schema.Boolean,
  parentFolderId: Schema.optionalKey(DriveItemId),
}).annotate({ identifier: "FolderLocation" });

/** Current OneDrive location shown by the folder picker. */
export type FolderLocation = typeof FolderLocation.Type;

/** Folder-only view of one OneDrive location. */
export const FolderBrowserState = Schema.Struct({
  current: FolderLocation,
  folders: Schema.Array(SelectableFolder),
}).annotate({ identifier: "FolderBrowserState" });

/** Folder-only view of one OneDrive location. */
export type FolderBrowserState = typeof FolderBrowserState.Type;

/** Display-safe snapshot of the selected Hoofdmap boundary. */
export const LibraryRootDisplay = Schema.Struct({
  name: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
}).annotate({ identifier: "LibraryRootDisplay" });

/** Display-safe snapshot of the selected Hoofdmap boundary. */
export type LibraryRootDisplay = typeof LibraryRootDisplay.Type;

/** Persisted identity and display boundary for one Bibliotheek. */
export const LibraryBoundary = Schema.Struct({
  id: LibraryId,
  curatorProviderAccountId: MicrosoftAccountId,
  driveId: DriveId,
  rootDriveItemId: DriveItemId,
  root: LibraryRootDisplay,
});

/** Persisted identity and display boundary for one Bibliotheek. */
export type LibraryBoundary = typeof LibraryBoundary.Type;

/** Candidate persisted after Graph proves that it is a selectable folder. */
export type LibrarySelection = LibraryBoundary;
