import { Context, Effect, Layer, Option, Redacted, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { GraphReauthenticationRequired, OneDriveUnavailable } from "../library/errors.ts";
import type { DriveId, DriveItemId } from "../library/model.ts";
import { DriveItemId as DriveItemIdSchema } from "../library/model.ts";
import { PhotoNotFound } from "../photo/errors.ts";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const GraphPhotoItemResponse = Schema.Struct({
  id: DriveItemIdSchema,
  name: Schema.NonEmptyString,
  parentReference: Schema.OptionFromOptionalKey(
    Schema.Struct({ id: Schema.OptionFromOptionalKey(DriveItemIdSchema) }),
  ),
  file: Schema.OptionFromOptionalKey(
    Schema.Struct({ mimeType: Schema.OptionFromOptionalKey(Schema.NonEmptyString) }),
  ),
  cTag: Schema.OptionFromOptionalKey(Schema.NonEmptyString),
  eTag: Schema.OptionFromOptionalKey(Schema.NonEmptyString),
  "@microsoft.graph.downloadUrl": Schema.OptionFromOptionalKey(Schema.NonEmptyString),
});

/** Server-only Graph file details needed to hydrate or preview a Foto. */
export interface GraphPhotoFile {
  readonly id: DriveItemId;
  readonly name: string;
  readonly parentItemId: Option.Option<DriveItemId>;
  readonly mimeType: Option.Option<string>;
  readonly cTag: Option.Option<string>;
  readonly eTag: Option.Option<string>;
  readonly downloadUrl: Option.Option<Redacted.Redacted>;
}

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

function notFound(): PhotoNotFound {
  return new PhotoNotFound({
    message: "Deze Foto bestaat niet in de actieve Bibliotheek.",
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

      const response = yield* client.execute(request).pipe(Effect.mapError(unavailable));

      if (response.status === 401 || response.status === 403) {
        return yield* reauthenticationRequired();
      }

      if (response.status === 404) {
        return yield* notFound();
      }

      if (response.status < 200 || response.status >= 300) {
        return yield* unavailable();
      }

      const item = yield* HttpClientResponse.schemaBodyJson(GraphPhotoItemResponse)(response).pipe(
        Effect.mapError(unavailable),
      );

      const downloadUrl = yield* Option.match(item["@microsoft.graph.downloadUrl"], {
        onNone: () => Effect.succeed(Option.none<Redacted.Redacted>()),
        onSome: (url) => parseDownloadUrl(url).pipe(Effect.map(Option.some)),
      });

      return {
        id: item.id,
        name: item.name,
        parentItemId: Option.flatMap(item.parentReference, (parent) => parent.id),
        mimeType: Option.flatMap(item.file, (file) => file.mimeType),
        cTag: item.cTag,
        eTag: item.eTag,
        downloadUrl,
      } satisfies GraphPhotoFile;
    });

    const download = Effect.fn("MicrosoftGraphPhotoApi.download")(function* (
      downloadUrl: Redacted.Redacted,
    ) {
      // The preauthenticated URL contains a short-lived credential, so it must not enter HTTP spans.
      const response = yield* downloadClient
        .execute(HttpClientRequest.get(Redacted.value(downloadUrl)))
        .pipe(Effect.withTracerEnabled(false), Effect.mapError(unavailable));

      if (response.status < 200 || response.status >= 300) {
        return yield* unavailable();
      }

      return response.stream.pipe(Stream.mapError(unavailable));
    });

    return MicrosoftGraphPhotoApi.of({ download, getFile });
  }),
);
