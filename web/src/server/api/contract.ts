import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";

export const LibraryId = Schema.String.pipe(Schema.brand("LibraryId")).annotate({
  format: "throwback-library-id",
  identifier: "LibraryId",
});

export const EventId = Schema.String.pipe(Schema.brand("EventId")).annotate({
  format: "throwback-event-id",
  identifier: "EventId",
});

export const PhotoId = Schema.String.pipe(Schema.brand("PhotoId")).annotate({
  format: "throwback-photo-id",
  identifier: "PhotoId",
});

export const SignInRequired = Schema.TaggedStruct("SignInRequired", {}).annotate({
  identifier: "SignInRequired",
});

export const CuratorClaimRequired = Schema.TaggedStruct("CuratorClaimRequired", {}).annotate({
  identifier: "CuratorClaimRequired",
});

export const GraphConnectionRequired = Schema.TaggedStruct("GraphConnectionRequired", {}).annotate({
  identifier: "GraphConnectionRequired",
});

export const LibrarySelectionRequired = Schema.TaggedStruct(
  "LibrarySelectionRequired",
  {},
).annotate({ identifier: "LibrarySelectionRequired" });

export const LibraryIndexing = Schema.TaggedStruct("LibraryIndexing", {
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
    }).annotateMerge(OpenApi.annotations({ identifier: "getBootstrap" })),
  )
  .middleware(BuildCompatibility) {}

export class ThrowbackApi extends HttpApi.make("throwback-api")
  .add(BootstrapApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Throwback Beheer-webapp API",
      version: "1.0.0",
    }),
  ) {}
