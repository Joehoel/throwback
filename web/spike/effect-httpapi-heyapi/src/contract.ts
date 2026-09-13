import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

/** Stable Microsoft Graph drive identifier carried as a string on the wire. */
export const DriveId = Schema.String.pipe(Schema.brand("DriveId")).annotate({
  format: "throwback-drive-id",
  identifier: "DriveId",
});

/** Stable Microsoft Graph drive-item identifier carried as a string on the wire. */
export const DriveItemId = Schema.String.pipe(Schema.brand("DriveItemId")).annotate({
  format: "throwback-drive-item-id",
  identifier: "DriveItemId",
});

/** Durable command identifier carried as a string on the wire. */
export const CommandId = Schema.String.pipe(Schema.brand("CommandId")).annotate({
  format: "throwback-command-id",
  identifier: "CommandId",
});

/** A location explicitly set on the Foto. */
export const KnownLocation = Schema.TaggedStruct("KnownLocation", {
  latitude: Schema.Finite,
  longitude: Schema.Finite,
}).annotate({ identifier: "KnownLocation" });

/** An explicit instruction to remove any managed location. */
export const NoLocation = Schema.TaggedStruct("NoLocation", {}).annotate({
  identifier: "NoLocation",
});

/** Discriminated location intent used by a complete metadata target. */
export const LocationTarget = Schema.Union([KnownLocation, NoLocation]).annotate({
  identifier: "LocationTarget",
});

/** Complete managed metadata target accepted by a Goedkeuringsopdracht. */
export const ApprovalTarget = Schema.Struct({
  description: Schema.NullOr(Schema.String),
  location: Schema.NullOr(LocationTarget),
  orientation: Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8]),
}).annotate({ identifier: "ApprovalTarget" });

/** Durable command returned after accepting a Goedkeuringsopdracht. */
export const ApprovalAccepted = Schema.Struct({
  commandId: CommandId,
  status: Schema.Literal("accepted"),
}).annotate({ identifier: "ApprovalAccepted" });

/** Current Foto review projection. */
export const PhotoReview = Schema.Struct({
  driveId: DriveId,
  driveItemId: DriveItemId,
  description: Schema.NullOr(Schema.String),
  location: Schema.NullOr(LocationTarget),
  reviewState: Schema.Union([
    Schema.TaggedStruct("NeedsReview", {}),
    Schema.TaggedStruct("CommandAccepted", { commandId: ApprovalAccepted.fields.commandId }),
  ]),
}).annotate({ identifier: "PhotoReview" });

/** Returned when the requested Foto is not in the D1 projection. */
export class PhotoNotFound extends Schema.TaggedErrorClass<PhotoNotFound>()(
  "PhotoNotFound",
  { driveItemId: DriveItemId, message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Returned when a write targets a stale Foto base. */
export class PhotoConflict extends Schema.TaggedErrorClass<PhotoConflict>()(
  "PhotoConflict",
  { currentETag: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** Returned when the Better Auth session cookie is absent or invalid. */
export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/** Application identity made available by cookie authentication. */
export class CurrentCurator extends Context.Service<CurrentCurator, { readonly id: string }>()(
  "throwback/spike/CurrentCurator",
) {}

/** Same-origin Better Auth session represented in OpenAPI as an HttpOnly cookie. */
export class CuratorSession extends HttpApiMiddleware.Service<
  CuratorSession,
  { provides: CurrentCurator }
>()("throwback/spike/CuratorSession", {
  requiredForClient: true,
  security: {
    session: HttpApiSecurity.apiKey({ in: "cookie", key: "throwback_session" }),
  },
  error: Unauthorized,
}) {}

/** Representative Beheer-webapp operations used by the contract-chain spike. */
export class CurationApi extends HttpApiGroup.make("curation")
  .add(
    HttpApiEndpoint.get("getPhoto", "/drives/:driveId/photos/:driveItemId", {
      params: { driveId: DriveId, driveItemId: DriveItemId },
      query: { projectionRevision: Schema.FiniteFromString },
      success: PhotoReview,
      error: PhotoNotFound,
    }).annotateMerge(OpenApi.annotations({ identifier: "getPhoto" })),
    HttpApiEndpoint.post("approvePhoto", "/drives/:driveId/photos/:driveItemId/approvals", {
      params: { driveId: DriveId, driveItemId: DriveItemId },
      headers: {
        "idempotency-key": Schema.String,
        "if-match": Schema.String,
      },
      payload: ApprovalTarget,
      success: ApprovalAccepted.pipe(HttpApiSchema.status(202)),
      error: [PhotoNotFound, PhotoConflict],
    }).annotateMerge(OpenApi.annotations({ identifier: "approvePhoto" })),
    HttpApiEndpoint.get("getPreview", "/drives/:driveId/photos/:driveItemId/preview", {
      params: { driveId: DriveId, driveItemId: DriveItemId },
      success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "image/jpeg" })),
      error: PhotoNotFound,
    }).annotateMerge(OpenApi.annotations({ identifier: "getPreview" })),
  )
  .middleware(CuratorSession) {}

/** Single Effect contract from which the server router and OpenAPI artifact are derived. */
export class ThrowbackApi extends HttpApi.make("throwback-api")
  .add(CurationApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Throwback Beheer-webapp contract spike",
      version: "0.0.0-spike",
    }),
  ) {}
