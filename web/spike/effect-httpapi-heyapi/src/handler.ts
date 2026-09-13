import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  ApprovalAccepted,
  CommandId,
  CuratorSession,
  CurrentCurator,
  PhotoConflict,
  PhotoNotFound,
  ThrowbackApi,
  Unauthorized,
} from "./contract.ts";

const CurationHandlers = HttpApiBuilder.group(
  ThrowbackApi,
  "curation",
  Effect.fnUntraced(function* (handlers) {
    return handlers
      .handle(
        "getPhoto",
        Effect.fnUntraced(function* ({ params }) {
          yield* CurrentCurator;
          if (params.driveItemId === "missing") {
            return yield* new PhotoNotFound({
              driveItemId: params.driveItemId,
              message: "Foto is not present in the projection",
            });
          }
          return {
            driveId: params.driveId,
            driveItemId: params.driveItemId,
            description: null,
            location: null,
            reviewState: { _tag: "NeedsReview" as const },
          };
        }),
      )
      .handle(
        "approvePhoto",
        Effect.fnUntraced(function* ({ headers, params }) {
          yield* CurrentCurator;
          if (params.driveItemId === "missing") {
            return yield* new PhotoNotFound({
              driveItemId: params.driveItemId,
              message: "Foto is not present in the projection",
            });
          }
          if (headers["if-match"] !== '\"etag-current\"') {
            return yield* new PhotoConflict({
              currentETag: '\"etag-current\"',
              message: "Foto base changed",
            });
          }
          return ApprovalAccepted.make({
            commandId: CommandId.make(`command-${headers["idempotency-key"]}`),
            status: "accepted",
          });
        }),
      )
      .handle(
        "getPreview",
        Effect.fnUntraced(function* ({ params }) {
          yield* CurrentCurator;
          if (params.driveItemId === "missing") {
            return yield* new PhotoNotFound({
              driveItemId: params.driveItemId,
              message: "Foto is not present in the projection",
            });
          }
          return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
        }),
      );
  }),
);

const CuratorSessionLive = Layer.succeed(CuratorSession)({
  session: (effect, options) => {
    if (Redacted.value(options.credential) !== "valid-session") {
      return new Unauthorized({ message: "Valid Curator session required" });
    }
    return Effect.provideService(effect, CurrentCurator, { id: "curator-1" });
  },
});

const ApiRoutes = HttpApiBuilder.layer(ThrowbackApi).pipe(
  Layer.provide(CurationHandlers),
  Layer.provide(CuratorSessionLive),
  Layer.provide(HttpServer.layerServices),
);

const { handler } = HttpRouter.toWebHandler(ApiRoutes);

/** Serve the Effect API directly at its contract paths. */
export function handleContractRequest(request: Request): Promise<Response> {
  return handler(request);
}

const prototypeMount = "/prototypes/httpapi";

/** Adapt a TanStack Start catch-all request to the contract's root-relative paths. */
export function handlePrototypeRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice(prototypeMount.length) || "/";
  return handler(new Request(url, request));
}
