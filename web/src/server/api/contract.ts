import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";
import { CuratorAccessUnavailable, CuratorOwnershipConflict } from "../curator/errors.ts";
import { MicrosoftAccountDisplay } from "../curator/model.ts";
import {
  GraphReauthenticationRequired,
  InvalidLibrarySelection,
  LibraryAlreadySelected,
  LibraryStoreUnavailable,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
} from "../library/errors.ts";
import {
  DriveItemId,
  FolderBrowserState,
  LibraryId,
  LibraryRootDisplay,
} from "../library/model.ts";
import { CuratorAuthorization, SignedInSessionAuthorization } from "./authentication.ts";

export const EventId = Schema.String.pipe(Schema.brand("EventId")).annotate({
  format: "throwback-event-id",
  identifier: "EventId",
});

export const PhotoId = Schema.String.pipe(Schema.brand("PhotoId")).annotate({
  format: "throwback-photo-id",
  identifier: "PhotoId",
});

export const SignInRequired = Schema.TaggedStruct("SignInRequired", {
  reason: Schema.Literals(["signedOut", "ownerMismatch"]),
}).annotate({
  identifier: "SignInRequired",
});

export const CuratorClaimRequired = Schema.TaggedStruct("CuratorClaimRequired", {
  account: MicrosoftAccountDisplay,
}).annotate({ identifier: "CuratorClaimRequired" });

export const GraphConnectionRequired = Schema.TaggedStruct("GraphConnectionRequired", {
  account: MicrosoftAccountDisplay,
}).annotate({ identifier: "GraphConnectionRequired" });

export const LibrarySelectionRequired = Schema.TaggedStruct(
  "LibrarySelectionRequired",
  {},
).annotate({ identifier: "LibrarySelectionRequired" });

export const LibraryIndexing = Schema.TaggedStruct("LibraryIndexing", {
  libraryId: LibraryId,
  rootFolder: LibraryRootDisplay,
  discoveredPhotos: Schema.Finite,
}).annotate({ identifier: "LibraryIndexing" });

export const ReviewReady = Schema.TaggedStruct("ReviewReady", {
  libraryId: LibraryId,
  eventId: EventId,
  photoId: PhotoId,
}).annotate({ identifier: "ReviewReady" });

export const BootstrapState = Schema.Union([
  SignInRequired,
  CuratorClaimRequired,
  GraphConnectionRequired,
  LibrarySelectionRequired,
  LibraryIndexing,
  ReviewReady,
]).annotate({ identifier: "BootstrapState" });

export type BootstrapState = typeof BootstrapState.Type;

export class BuildUpgradeRequired extends Schema.TaggedError<BuildUpgradeRequired>()(
  "BuildUpgradeRequired",
  {
    currentBuildId: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class BuildCompatibility extends HttpApiMiddleware.Service<BuildCompatibility>()(
  "throwback/api/BuildCompatibility",
  { error: BuildUpgradeRequired },
) {}

export class BootstrapApi extends HttpApiGroup.make("bootstrap")
  .add(
    HttpApiEndpoint.get("getBootstrap", "/bootstrap", {
      success: BootstrapState,
      error: CuratorAccessUnavailable,
    }).annotateMerge(OpenApi.annotations({ identifier: "getBootstrap" })),
  )
  .middleware(BuildCompatibility) {}

export const ConfirmCuratorClaim = Schema.Struct({
  confirmed: Schema.Literal(true),
}).annotate({ identifier: "ConfirmCuratorClaim" });

export class CuratorApi extends HttpApiGroup.make("curator")
  .add(
    HttpApiEndpoint.post("claimCurator", "/claim", {
      payload: ConfirmCuratorClaim,
      success: BootstrapState,
      error: [CuratorOwnershipConflict, CuratorAccessUnavailable],
    }).annotateMerge(OpenApi.annotations({ identifier: "claimCurator" })),
  )
  .middleware(SignedInSessionAuthorization)
  .middleware(BuildCompatibility)
  .prefix("/curator") {}

export const SelectLibraryRequest = Schema.Struct({
  rootFolderId: DriveItemId,
  confirmed: Schema.Literal(true),
}).annotate({ identifier: "SelectLibraryRequest" });

const LibraryErrors = [
  GraphReauthenticationRequired,
  LibraryAlreadySelected,
  LibraryStoreUnavailable,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
] as const;

export class LibraryApi extends HttpApiGroup.make("library")
  .add(
    HttpApiEndpoint.get("listLibraryFolders", "/folders", {
      query: { parentFolderId: Schema.optionalKey(DriveItemId) },
      success: FolderBrowserState,
      error: LibraryErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "listLibraryFolders" })),
  )
  .add(
    HttpApiEndpoint.post("selectLibrary", "/selection", {
      payload: SelectLibraryRequest,
      success: LibraryIndexing,
      error: [...LibraryErrors, InvalidLibrarySelection],
    }).annotateMerge(OpenApi.annotations({ identifier: "selectLibrary" })),
  )
  .middleware(CuratorAuthorization)
  .middleware(BuildCompatibility)
  .prefix("/library") {}

export class ThrowbackApi extends HttpApi.make("throwback-api")
  .add(BootstrapApi)
  .add(CuratorApi)
  .add(LibraryApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Throwback Beheer-webapp API",
      version: "1.0.0",
    }),
  ) {}
