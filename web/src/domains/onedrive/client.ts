import { Context, Effect, Layer, Option, Stream } from "effect";
import type { Schema } from "effect";
import { HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { GraphRequestError } from "#/domain/errors.ts";
import type { TokenUnavailable } from "#/domain/errors.ts";
import type { GraphDriveItem } from "#/domain/graph.ts";
import type { DriveItemId, UserId } from "#/domain/ids.ts";
import type { Description, Location } from "#/domain/photo.ts";
import { GRAPH_BASE, graphErrorFromHttp, OneDriveHttp } from "./http-client.ts";
import { GraphChildrenPage, GraphLocationEnvelope } from "./schemas.ts";
import { GraphToken } from "./token.ts";

/**
 * The OneDrive service: the Graph operations the Curation webapp needs, on top
 * of the custom HTTP client (`OneDriveHttp`) + the token source (`GraphToken`).
 * Read path (ADR-0004), description PATCH (ADR-0002), and the byte
 * download/re-upload/verify the P6 write-path Workflow orchestrates (ADR-0011).
 *
 * Consumers depend on this interface, never on the layer (ADR-0012 / build
 * against interfaces): the live wiring is in `runtime.ts`, tests swap the deps.
 */
/** The OneDrive operations, as an interface consumers depend on (separate from the service key). */
export interface OneDriveClientApi {
  /**
   * Recursively crawl the root folder as a `Stream` of file items (folders are traversed, not emitted).
   * Streaming lets the indexer upsert progressively instead of buffering the whole library (PRD:
   * "streamend indexeren"). Run with `Stream.runForEach` / `Stream.runCollect`.
   */
  readonly crawl: (
    userId: UserId,
    rootFolderId: DriveItemId,
  ) => Stream.Stream<GraphDriveItem, GraphRequestError | TokenUnavailable>;
  /** Cheap description write (ADR-0002), outside the workflow. */
  readonly patchDescription: (
    userId: UserId,
    photoId: DriveItemId,
    text: Description,
  ) => Effect.Effect<void, GraphRequestError | TokenUnavailable>;
  /** Download the original bytes (write path). */
  readonly downloadBytes: (
    userId: UserId,
    photoId: DriveItemId,
  ) => Effect.Effect<Uint8Array, GraphRequestError | TokenUnavailable>;
  /** Re-upload bytes after EXIF injection — JPEG content-type (ADR-0011). */
  readonly uploadBytes: (
    userId: UserId,
    photoId: DriveItemId,
    bytes: Uint8Array,
  ) => Effect.Effect<void, GraphRequestError | TokenUnavailable>;
  /** Read back the `location` facet to verify a write (ADR-0011); null = no facet yet. */
  readonly verifyLocation: (
    userId: UserId,
    photoId: DriveItemId,
  ) => Effect.Effect<Location | null, GraphRequestError | TokenUnavailable>;
}

export class OneDriveClient extends Context.Service<OneDriveClient, OneDriveClientApi>()("OneDriveClient") {}

// The driveItem fields the children-crawl needs to project a Photo (domain-model §3).
const SELECT = "id,name,description,lastModifiedDateTime,file,folder,location,parentReference";

// Decode a JSON body. Body accessors carry the response's own HttpClientError → map it to the
// GraphRequestError; a shape mismatch (Graph contract drift) is a defect, not a recoverable error.
const decode = <S extends Schema.Top>(schema: S) => (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.catchTag("HttpClientError", (error) => Effect.fail(graphErrorFromHttp(error))),
    Effect.catchTag("SchemaError", (error) => Effect.die(error)),
  );

const make = Effect.gen(function* make() {
  const http = yield* OneDriveHttp;
  const token = yield* GraphToken;

  // Attach a fresh per-user bearer token, then run on the configured Graph client.
  const send = (userId: UserId, request: HttpClientRequest.HttpClientRequest) =>
    token.forUser(userId).pipe(
      Effect.map((accessToken) => HttpClientRequest.bearerToken(request, accessToken)),
      Effect.flatMap((authed) => http.execute(authed)),
      // Bound time-to-response (not the streamed body) so a hung Graph request fails fast.
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Effect.fail(new GraphRequestError({ status: 0 })),
      }),
    );

  // One page of a children collection at the given path.
  const fetchPage = Effect.fn("onedrive.fetchPage")(function*  fetchPage(userId: UserId, path: string) {
    const response = yield* send(userId, HttpClientRequest.get(path));
    return yield* decode(GraphChildrenPage)(response);
  });

  // All children of a folder (files + folders) as a Stream, following `@odata.nextLink`. The link is
  // Absolute → strip the base so the client's prependUrl re-adds it.
  const childrenStream = (userId: UserId, folderId: DriveItemId) =>
    Stream.paginate(`/drive/items/${folderId}/children?$select=${SELECT}`, (path: string) =>
      fetchPage(userId, path).pipe(
        Effect.map((page) => {
          const next = page["@odata.nextLink"];
          return [
            page.value,
            next === undefined ? Option.none<string>() : Option.some(next.replace(GRAPH_BASE, "")),
          ] as const;
        }),
      ),
    );

  // Recursive crawl: emit file items, recurse into subfolders — a Stream all the way down.
  const crawl = (userId: UserId, rootFolderId: DriveItemId): Stream.Stream<
    GraphDriveItem,
    GraphRequestError | TokenUnavailable
  > =>
    childrenStream(userId, rootFolderId).pipe(
      Stream.flatMap((item) => (item.folder === undefined ? Stream.succeed(item) : crawl(userId, item.id))),
    );

  const patchDescription = Effect.fn("onedrive.patchDescription")(function*  patchDescription(
    userId: UserId,
    photoId: DriveItemId,
    text: Description,
  ) {
    // Encoding a `{ description }` object can't realistically fail → orDie.
    const request = yield* Effect.orDie(
      HttpClientRequest.bodyJson(HttpClientRequest.patch(`/drive/items/${photoId}`), { description: text }),
    );
    yield* send(userId, request);
  });

  const downloadBytes = Effect.fn("onedrive.downloadBytes")(function*  downloadBytes(userId: UserId, photoId: DriveItemId) {
    const response = yield* send(userId, HttpClientRequest.get(`/drive/items/${photoId}/content`));
    const buffer = yield* response.arrayBuffer.pipe(
      Effect.catchTag("HttpClientError", (error) => Effect.fail(graphErrorFromHttp(error))),
    );
    return new Uint8Array(buffer);
  });

  const uploadBytes = Effect.fn("onedrive.uploadBytes")(function*  uploadBytes(
    userId: UserId,
    photoId: DriveItemId,
    bytes: Uint8Array,
  ) {
    const request = HttpClientRequest.bodyUint8Array(
      HttpClientRequest.put(`/drive/items/${photoId}/content`),
      bytes,
      "image/jpeg",
    );
    yield* send(userId, request);
  });

  const verifyLocation = Effect.fn("onedrive.verifyLocation")(function*  verifyLocation(userId: UserId, photoId: DriveItemId) {
    const response = yield* send(userId, HttpClientRequest.get(`/drive/items/${photoId}?$select=location`));
    const envelope = yield* decode(GraphLocationEnvelope)(response);
    return envelope.location ?? null;
  });

  return OneDriveClient.of({ crawl, patchDescription, downloadBytes, uploadBytes, verifyLocation });
});

export const OneDriveClientLive: Layer.Layer<OneDriveClient, never, OneDriveHttp | GraphToken> =
  Layer.effect(OneDriveClient)(make);
