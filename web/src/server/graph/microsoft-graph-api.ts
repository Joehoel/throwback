import {
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Result,
  Schema,
  SchemaIssue,
  SchemaTransformation,
  Stream,
} from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import {
  GraphReauthenticationRequired,
  OneDriveFolderNotFound,
  OneDriveUnavailable,
} from "../library/errors.ts";
import type { DriveId, DriveItemId, SelectableFolder } from "../library/model.ts";
import {
  DriveId as DriveIdSchema,
  DriveItemId as DriveItemIdSchema,
  SelectableFolder as SelectableFolderSchema,
} from "../library/model.ts";
import type { DriveDeltaPage, GraphDeltaLink } from "../library/library-index-model.ts";
import { GraphItemNotFolder } from "./errors.ts";
import { GraphDeltaPageResponse } from "./graph-delta-schema.ts";

const GRAPH_ORIGIN = "https://graph.microsoft.com";

const GRAPH_BASE_URL = `${GRAPH_ORIGIN}/v1.0`;

const GraphDriveResponse = Schema.Struct({ id: Schema.String }).pipe(
  Schema.decodeTo(
    DriveIdSchema,
    SchemaTransformation.transform({
      decode: ({ id }) => id,
      encode: (id) => ({ id }),
    }),
  ),
);

const GraphFolderFacet = Schema.Struct({ childCount: Schema.Finite });

const GraphParentReference = Schema.Struct({
  id: Schema.OptionFromOptionalKey(DriveItemIdSchema),
  path: Schema.OptionFromOptionalKey(Schema.String),
});

const GraphDriveItemResponse = Schema.Struct({
  id: DriveItemIdSchema,
  name: Schema.NonEmptyString,
  folder: Schema.OptionFromOptionalKey(GraphFolderFacet),
  parentReference: Schema.OptionFromOptionalKey(GraphParentReference),
  remoteItem: Schema.OptionFromOptionalKey(Schema.Unknown),
});

/** Local folder metadata decoded from a Microsoft Graph drive item. */
export const GraphFolder = Schema.Struct({
  id: DriveItemIdSchema,
  name: Schema.NonEmptyString,
  childCount: Schema.Finite,
  parentFolderId: Schema.Option(DriveItemIdSchema),
  parentPath: Schema.Option(Schema.String),
});

/** Local folder metadata decoded from a Microsoft Graph drive item. */
export type GraphFolder = typeof GraphFolder.Type;

const OptionalGraphFolderResponse = GraphDriveItemResponse.pipe(
  Schema.decodeTo(
    Schema.Option(GraphFolder),
    SchemaTransformation.transformEffect({
      decode: (item) => {
        if (Option.isNone(item.folder) || Option.isSome(item.remoteItem)) {
          return Effect.succeed(Option.none());
        }

        const parentFolderId = Option.flatMap(item.parentReference, (parent) => parent.id);
        const parentPath = Option.flatMap(item.parentReference, (parent) => parent.path);

        return Effect.succeed(
          Option.some(
            GraphFolder.make({
              id: item.id,
              name: item.name,
              childCount: item.folder.value.childCount,
              parentFolderId,
              parentPath,
            }),
          ),
        );
      },
      encode: (folder) =>
        Effect.fail(
          new SchemaIssue.Forbidden(
            { message: "Microsoft Graph response schemas are decode-only" },
            folder,
          ),
        ),
    }),
  ),
);

const OptionalSelectableFolderResponse = GraphDriveItemResponse.pipe(
  Schema.decodeTo(
    Schema.Option(SelectableFolderSchema),
    SchemaTransformation.transformEffect({
      decode: (item) =>
        Option.isNone(item.folder) || Option.isSome(item.remoteItem)
          ? Effect.succeed(Option.none())
          : Effect.succeed(
              Option.some(
                SelectableFolderSchema.make({
                  id: item.id,
                  name: item.name,
                  childCount: item.folder.value.childCount,
                }),
              ),
            ),
      encode: (folder) =>
        Effect.fail(
          new SchemaIssue.Forbidden(
            { message: "Microsoft Graph response schemas are decode-only" },
            folder,
          ),
        ),
    }),
  ),
);

const GraphFolderPage = Schema.Struct({
  value: Schema.Array(OptionalSelectableFolderResponse),
  "@odata.nextLink": Schema.OptionFromOptionalKey(Schema.String),
});

type GraphReadError = GraphReauthenticationRequired | OneDriveFolderNotFound | OneDriveUnavailable;

/** Typed, server-only HTTP operations against the delegated Microsoft Graph API. */
export interface MicrosoftGraphApiService {
  readonly getDefaultDrive: (
    token: Redacted.Redacted,
  ) => Effect.Effect<DriveId, GraphReauthenticationRequired | OneDriveUnavailable>;
  readonly getFolder: (
    token: Redacted.Redacted,
    driveId: DriveId,
    folderId: Option.Option<DriveItemId>,
  ) => Effect.Effect<GraphFolder, GraphItemNotFolder | GraphReadError>;
  readonly listChildFolders: (
    token: Redacted.Redacted,
    driveId: DriveId,
    folderId: DriveItemId,
  ) => Effect.Effect<readonly SelectableFolder[], GraphReadError>;
  readonly getDriveRootDeltaPage: (
    token: Redacted.Redacted,
    driveId: DriveId,
    continuation: Option.Option<GraphDeltaLink>,
  ) => Effect.Effect<DriveDeltaPage, GraphReadError>;
}

/** Typed, server-only HTTP operations against the delegated Microsoft Graph API. */
export class MicrosoftGraphApi extends Context.Service<
  MicrosoftGraphApi,
  MicrosoftGraphApiService
>()("throwback/graph/MicrosoftGraphApi") {}

function reauthenticationRequired(): GraphReauthenticationRequired {
  return new GraphReauthenticationRequired({
    message: "Verbind OneDrive opnieuw met hetzelfde Microsoft-account.",
  });
}

function folderNotFound(): OneDriveFolderNotFound {
  return new OneDriveFolderNotFound({
    message: "Deze OneDrive-map bestaat niet meer of is niet bereikbaar.",
  });
}

function oneDriveUnavailable(): OneDriveUnavailable {
  return new OneDriveUnavailable({
    message: "OneDrive kan de mappen nu niet veilig laden. Probeer het opnieuw.",
  });
}

function itemNotFolder(): GraphItemNotFolder {
  return new GraphItemNotFolder({
    message: "Microsoft Graph heeft geen lokale map voor dit item teruggegeven.",
  });
}

/** Effect HttpClient implementation of the delegated Microsoft Graph API. */
export const MicrosoftGraphApiLive = Layer.effect(
  MicrosoftGraphApi,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const graphGet = (path: string, query: Record<string, string>) =>
      HttpClientRequest.get(path).pipe(
        HttpClientRequest.prependUrl(GRAPH_BASE_URL),
        HttpClientRequest.setUrlParams(query),
      );

    const requestJson = Effect.fn("MicrosoftGraphApi.requestJson")(function* <S extends Schema.Top>(
      token: Redacted.Redacted,
      request: HttpClientRequest.HttpClientRequest,
      schema: S,
    ) {
      const response = yield* request.pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(Redacted.value(token)),
        client.execute,
        Effect.mapError(oneDriveUnavailable),
      );

      if (response.status === 401 || response.status === 403) {
        return yield* reauthenticationRequired();
      }

      if (response.status === 404) {
        return yield* folderNotFound();
      }

      if (response.status < 200 || response.status >= 300) {
        return yield* oneDriveUnavailable();
      }

      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(oneDriveUnavailable),
      );
    });

    const nextPageRequest = Effect.fnUntraced(function* (
      value: Option.Option<string>,
      expectedPath: string,
    ) {
      if (Option.isNone(value)) {
        return Option.none<HttpClientRequest.HttpClientRequest>();
      }

      if (!URL.canParse(value.value)) {
        return yield* oneDriveUnavailable();
      }

      const url = new URL(value.value);

      if (url.origin !== GRAPH_ORIGIN || url.pathname !== expectedPath) {
        return yield* oneDriveUnavailable();
      }

      return Option.some(HttpClientRequest.get(url.toString()));
    });

    const getDefaultDrive = Effect.fn("MicrosoftGraphApi.getDefaultDrive")(function* (
      token: Redacted.Redacted,
    ) {
      return yield* requestJson(
        token,
        graphGet("/me/drive", { $select: "id" }),
        GraphDriveResponse,
      ).pipe(Effect.catchTag("OneDriveFolderNotFound", oneDriveUnavailable));
    });

    const getFolder = Effect.fn("MicrosoftGraphApi.getFolder")(function* (
      token: Redacted.Redacted,
      driveId: DriveId,
      folderId: Option.Option<DriveItemId>,
    ) {
      const request = Option.match(folderId, {
        onNone: () =>
          graphGet(`/drives/${encodeURIComponent(driveId)}/root`, {
            $select: "id,name,folder",
          }),
        onSome: (id) =>
          graphGet(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}`, {
            $select: "id,name,folder,parentReference,remoteItem",
          }),
      });

      const folder = yield* requestJson(token, request, OptionalGraphFolderResponse);

      return yield* Option.match(folder, {
        onNone: itemNotFolder,
        onSome: Effect.succeed,
      });
    });

    const listChildFolders = Effect.fn("MicrosoftGraphApi.listChildFolders")(function* (
      token: Redacted.Redacted,
      driveId: DriveId,
      folderId: DriveItemId,
    ) {
      const childrenPath = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children`;

      const firstPage = graphGet(childrenPath, {
        $select: "id,name,folder,remoteItem",
        $orderby: "name",
        $top: "200",
      });

      return yield* Stream.paginate(firstPage, (request) =>
        requestJson(token, request, GraphFolderPage).pipe(
          Effect.flatMap((page) =>
            nextPageRequest(page["@odata.nextLink"], `/v1.0${childrenPath}`).pipe(
              Effect.map((nextPage) => [page.value, nextPage] as const),
            ),
          ),
        ),
      ).pipe(
        Stream.filterMap((folder) => Result.fromOption(folder, () => null)),
        Stream.runCollect,
      );
    });

    const getDriveRootDeltaPage = Effect.fn("MicrosoftGraphApi.getDriveRootDeltaPage")(function* (
      token: Redacted.Redacted,
      driveId: DriveId,
      continuation: Option.Option<GraphDeltaLink>,
    ) {
      const request = Option.match(continuation, {
        onNone: () =>
          graphGet(`/drives/${encodeURIComponent(driveId)}/root/delta`, {
            $select: "id,parentReference,folder,file,deleted",
          }),
        onSome: (link) => HttpClientRequest.get(link),
      });

      return yield* requestJson(token, request, GraphDeltaPageResponse);
    });

    return MicrosoftGraphApi.of({
      getDefaultDrive,
      getDriveRootDeltaPage,
      getFolder,
      listChildFolders,
    });
  }),
);
