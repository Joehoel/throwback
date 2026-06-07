import { Context, Effect, Layer, Option, Stream } from "effect";
import { HttpClientRequest } from "effect/unstable/http";
import type { GraphRequestError, TokenUnavailable } from "#/domains/shared/errors.ts";
import type { GraphDriveItem } from "#/domains/shared/graph.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Description, Location } from "#/domains/shared/photo.ts";
import { bytesOf, decodeJson, GRAPH_BASE, OneDriveHttp } from "./http-client.ts";
import { GraphChildrenPage, GraphLocationEnvelope } from "./schemas.ts";
import type { CurrentUser, GraphToken } from "./token.ts";

/**
 * The OneDrive service: the Graph operations the Curation webapp needs, on top of
 * the custom HTTP client (`OneDriveHttp`), which already handles auth, base URL,
 * retry, timeout, and error mapping — so these methods just `.execute` a request
 * and read the body via `decodeJson`/`bytesOf`. Read path (ADR-0004), description
 * PATCH (ADR-0002), and the byte download/re-upload/verify the P6 write-path
 * Workflow orchestrates (ADR-0011).
 *
 * `CurrentUser | GraphToken` are the client's request-scoped requirements (the
 * bearer is attached inside `OneDriveHttp`); provided at the boundary, never
 * threaded through these signatures. Consumers depend on this interface, not the
 * layer (ADR-0012): live wiring is in `runtime.ts`, tests swap the deps.
 */
type GraphAuth = CurrentUser | GraphToken;

export interface OneDriveClientApi {
  /**
   * Recursively crawl the root folder as a `Stream` of file items (folders are traversed, not emitted).
   * Streaming lets the indexer upsert progressively instead of buffering the whole library (PRD:
   * "streamend indexeren"). Run with `Stream.runForEach` / `Stream.runCollect`.
   */
  readonly crawl: (
    rootFolderId: DriveItemId,
  ) => Stream.Stream<GraphDriveItem, GraphRequestError | TokenUnavailable, GraphAuth>;
  /** Cheap description write (ADR-0002), outside the workflow. */
  readonly patchDescription: (
    photoId: DriveItemId,
    text: Description,
  ) => Effect.Effect<void, GraphRequestError | TokenUnavailable, GraphAuth>;
  /** Download the original bytes (write path). */
  readonly downloadBytes: (
    photoId: DriveItemId,
  ) => Effect.Effect<Uint8Array, GraphRequestError | TokenUnavailable, GraphAuth>;
  /** Re-upload bytes after EXIF injection — JPEG content-type (ADR-0011). */
  readonly uploadBytes: (
    photoId: DriveItemId,
    bytes: Uint8Array,
  ) => Effect.Effect<void, GraphRequestError | TokenUnavailable, GraphAuth>;
  /** Read back the `location` facet to verify a write (ADR-0011); null = no facet yet. */
  readonly verifyLocation: (
    photoId: DriveItemId,
  ) => Effect.Effect<Location | null, GraphRequestError | TokenUnavailable, GraphAuth>;
}

export class OneDriveClient extends Context.Service<OneDriveClient, OneDriveClientApi>()(
  "OneDriveClient",
) {}

// The driveItem fields the children-crawl needs to project a Photo (domain-model §3).
const SELECT = "id,name,description,lastModifiedDateTime,file,folder,location,parentReference";

const make = OneDriveHttp.pipe(
  Effect.map((http) => {
    // One page of a children collection at the given path.
    const fetchPage = Effect.fn("onedrive.fetchPage")(function* (path: string) {
      const response = yield* http.execute(HttpClientRequest.get(path));
      return yield* decodeJson(GraphChildrenPage)(response);
    });

    // All children of a folder (files + folders) as a Stream, following `@odata.nextLink`. The link is
    // absolute → strip the base so the client's prependUrl re-adds it.
    const childrenStream = (folderId: DriveItemId) =>
      Stream.paginate(`/drive/items/${folderId}/children?$select=${SELECT}`, (path: string) =>
        fetchPage(path).pipe(
          Effect.map((page) => {
            const next = Option.fromNullishOr(page["@odata.nextLink"]).pipe(
              Option.map((link) => link.replace(GRAPH_BASE, "")),
            );
            return [page.value, next] as const;
          }),
        ),
      );

    // Recursive crawl: emit file items, recurse into subfolders — a Stream all the way down.
    const crawl = (
      rootFolderId: DriveItemId,
    ): Stream.Stream<GraphDriveItem, GraphRequestError | TokenUnavailable, GraphAuth> =>
      childrenStream(rootFolderId).pipe(
        Stream.flatMap((item) =>
          Option.match(Option.fromNullishOr(item.folder), {
            onNone: () => Stream.succeed(item), // a file → emit
            onSome: () => crawl(item.id), // a folder → descend
          }),
        ),
      );

    const patchDescription = Effect.fn("onedrive.patchDescription")(function* (
      photoId: DriveItemId,
      text: Description,
    ) {
      // Encoding a `{ description }` object can't realistically fail → orDie.
      const request = yield* Effect.orDie(
        HttpClientRequest.bodyJson(HttpClientRequest.patch(`/drive/items/${photoId}`), {
          description: text,
        }),
      );
      yield* http.execute(request);
    });

    const downloadBytes = Effect.fn("onedrive.downloadBytes")(function* (photoId: DriveItemId) {
      const response = yield* http.execute(
        HttpClientRequest.get(`/drive/items/${photoId}/content`),
      );
      return yield* bytesOf(response);
    });

    const uploadBytes = Effect.fn("onedrive.uploadBytes")(function* (
      photoId: DriveItemId,
      bytes: Uint8Array,
    ) {
      const request = HttpClientRequest.bodyUint8Array(
        HttpClientRequest.put(`/drive/items/${photoId}/content`),
        bytes,
        "image/jpeg",
      );
      yield* http.execute(request);
    });

    const verifyLocation = Effect.fn("onedrive.verifyLocation")(function* (photoId: DriveItemId) {
      const response = yield* http.execute(
        HttpClientRequest.get(`/drive/items/${photoId}?$select=location`),
      );
      const envelope = yield* decodeJson(GraphLocationEnvelope)(response);
      return envelope.location ?? null;
    });

    return OneDriveClient.of({
      crawl,
      patchDescription,
      downloadBytes,
      uploadBytes,
      verifyLocation,
    });
  }),
);

export const OneDriveClientLive = Layer.effect(OneDriveClient)(make);
