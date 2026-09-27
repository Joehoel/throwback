import {
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
  SchemaTransformation,
  Stream,
} from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { GraphReauthenticationRequired, OneDriveUnavailable } from "../library/errors.ts";
import type { DriveId, DriveItemId } from "../library/model.ts";
import { DriveItemId as DriveItemIdSchema } from "../library/model.ts";
import { PhotoNotFound } from "../photo/errors.ts";
import { executeGraphRequest } from "./graph-request-retry.ts";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const GraphPhotoItemWire = Schema.Struct({
  id: Schema.String,
  name: Schema.NonEmptyString,
  parentReference: Schema.OptionFromOptionalKey(
    Schema.Struct({ id: Schema.OptionFromOptionalKey(Schema.String) }),
  ),
  file: Schema.OptionFromOptionalKey(
    Schema.Struct({ mimeType: Schema.OptionFromOptionalKey(Schema.NonEmptyString) }),
  ),
  cTag: Schema.OptionFromOptionalKey(Schema.NonEmptyString),
  eTag: Schema.OptionFromOptionalKey(Schema.NonEmptyString),
  "@microsoft.graph.downloadUrl": Schema.OptionFromOptionalKey(Schema.NonEmptyString),
});

/** Server-only Graph file details needed to hydrate or preview a Foto. */
export const GraphPhotoFile = Schema.Struct({
  id: DriveItemIdSchema,
  name: Schema.NonEmptyString,
  parentItemId: Schema.Option(DriveItemIdSchema),
  mimeType: Schema.Option(Schema.NonEmptyString),
  cTag: Schema.Option(Schema.NonEmptyString),
  eTag: Schema.Option(Schema.NonEmptyString),
  downloadUrl: Schema.Option(Schema.RedactedFromValue(Schema.NonEmptyString)),
});

/** Server-only Graph file details needed to hydrate or preview a Foto. */
export type GraphPhotoFile = typeof GraphPhotoFile.Type;

const GraphPhotoItemResponse = GraphPhotoItemWire.pipe(
  Schema.decodeTo(
    GraphPhotoFile,
    SchemaTransformation.transform({
      decode: (item) => ({
        id: item.id,
        name: item.name,
        parentItemId: Option.flatMap(item.parentReference, (parent) => parent.id),
        mimeType: Option.flatMap(item.file, (file) => file.mimeType),
        cTag: item.cTag,
        eTag: item.eTag,
        downloadUrl: item["@microsoft.graph.downloadUrl"],
      }),
      encode: (file) => ({
        id: file.id,
        name: file.name,
        parentReference: Option.map(file.parentItemId, (id) => ({ id: Option.some(id) })),
        file: Option.map(file.mimeType, (mimeType) => ({ mimeType: Option.some(mimeType) })),
        cTag: file.cTag,
        eTag: file.eTag,
        "@microsoft.graph.downloadUrl": file.downloadUrl,
      }),
    }),
  ),
);

/** Typed Graph item and preauthenticated-content operations for Fotos. */
export interface MicrosoftGraphPhotoApiService {
  readonly getFile: (
    token: Redacted.Redacted,
    driveId: DriveId,
    itemId: DriveItemId,
  ) => Effect.Effect<
    GraphPhotoFile,
    GraphReauthenticationRequired | OneDriveUnavailable | PhotoNotFound
  >;
  readonly download: (
    downloadUrl: Redacted.Redacted,
  ) => Effect.Effect<Stream.Stream<Uint8Array, OneDriveUnavailable>, OneDriveUnavailable>;
}

/** Typed Graph item and preauthenticated-content operations for Fotos. */
export class MicrosoftGraphPhotoApi extends Context.Service<
  MicrosoftGraphPhotoApi,
  MicrosoftGraphPhotoApiService
>()("throwback/graph/MicrosoftGraphPhotoApi") {}

function reauthenticationRequired(): GraphReauthenticationRequired {
  return new GraphReauthenticationRequired({
    message: "Verbind OneDrive opnieuw met hetzelfde Microsoft-account.",
  });
}

function unavailable(): OneDriveUnavailable {
  return new OneDriveUnavailable({
    message: "OneDrive kan de Foto nu niet veilig laden. Probeer het opnieuw.",
  });
}

function notFound(operation: "preview" | "read" = "read"): PhotoNotFound {
  return new PhotoNotFound({
    message: "Deze Foto bestaat niet in de actieve Bibliotheek.",
    subsystem: "photo",
    operation,
    retryable: false,
  });
}

function parseDownloadUrl(value: string): Effect.Effect<Redacted.Redacted, OneDriveUnavailable> {
  if (!URL.canParse(value)) {
    return Effect.fail(unavailable());
  }

  const url = new URL(value);

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return Effect.fail(unavailable());
  }

  return Effect.succeed(Redacted.make(value));
}

/** Effect HttpClient implementation that never forwards Graph authorization to content URLs. */
export const MicrosoftGraphPhotoApiLive = Layer.effect(
  MicrosoftGraphPhotoApi,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const downloadClient = HttpClient.followRedirects(client, 3);

    const getFile = Effect.fn("MicrosoftGraphPhotoApi.getFile")(function* (
      token: Redacted.Redacted,
      driveId: DriveId,
      itemId: DriveItemId,
    ) {
      const request = HttpClientRequest.get(
        `${GRAPH_BASE_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
      ).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(Redacted.value(token)),
        HttpClientRequest.setUrlParams({
          $select: "id,name,parentReference,file,cTag,eTag,@microsoft.graph.downloadUrl",
        }),
      );

      const response = yield* executeGraphRequest({
        client,
        operation: "photo-details",
        request,
        retry: true,
      }).pipe(Effect.mapError(unavailable));

      if (response.status === 401 || response.status === 403) {
        return yield* reauthenticationRequired();
      }

      if (response.status === 404) {
        return yield* notFound("read");
      }

      if (response.status < 200 || response.status >= 300) {
        return yield* unavailable();
      }

      return yield* HttpClientResponse.schemaBodyJson(GraphPhotoItemResponse)(response).pipe(
        Effect.mapError(unavailable),
      );
    });

    const download = Effect.fn("MicrosoftGraphPhotoApi.download")(function* (
      downloadUrl: Redacted.Redacted,
    ) {
      const validatedUrl = yield* parseDownloadUrl(Redacted.value(downloadUrl));

      // The preauthenticated URL contains a short-lived credential, so it must not enter HTTP spans.
      const response = yield* executeGraphRequest({
        client: downloadClient,
        operation: "download",
        request: HttpClientRequest.get(Redacted.value(validatedUrl)),
        retry: false,
      }).pipe(Effect.mapError(unavailable));

      if (response.status < 200 || response.status >= 300) {
        return yield* unavailable();
      }

      return response.stream.pipe(Stream.mapError(unavailable));
    });

    return MicrosoftGraphPhotoApi.of({ download, getFile });
  }),
);
