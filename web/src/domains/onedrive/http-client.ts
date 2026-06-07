import { Context, Effect, Layer, Option, Schedule } from "effect";
import type { Schema } from "effect";
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import type { HttpClientError } from "effect/unstable/http";
import { GraphRequestError } from "#/domains/shared/errors.ts";
import type { TokenUnavailable } from "#/domains/shared/errors.ts";
import { CurrentUser, GraphToken } from "./token.ts";

/**
 * The custom HTTP client for Microsoft Graph (the OneDrive bounded context),
 * built on the unstable `effect/unstable/http` `HttpClient` (ADR-0012 P4). It
 * owns everything every Graph call shares so callers just `.execute` a request:
 * base URL, JSON `Accept`, **per-request bearer auth** (the current user's token),
 * a per-request timeout, throttle retry, and translation of transport/status/
 * timeout failures into the domain `GraphRequestError`. The body readers
 * (`decodeJson`/`bytesOf`) do the same translation, so `client.ts` never sees an
 * `HttpClientError`.
 *
 * Auth + user are request-scoped, so they sit in the client's requirements
 * (`CurrentUser | GraphToken`), resolved at the boundary — not threaded through
 * every method.
 */

/** Graph v1.0 base. `client.ts` strips this from absolute `@odata.nextLink`s before re-issuing. */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** `Retry-After` (seconds) off a throttling response, if present and numeric. */
const retryAfter = (response: HttpClientError.HttpClientError["response"]): Option.Option<number> =>
  Option.fromNullishOr(response).pipe(
    Option.flatMap((r) => Headers.get(r.headers, "retry-after")),
    Option.map(Number),
    Option.filter((seconds) => Number.isFinite(seconds)),
  );

/** Map a transport/status failure onto the domain error. */
export const graphErrorFromHttp = (error: HttpClientError.HttpClientError): GraphRequestError =>
  new GraphRequestError(
    Option.match(retryAfter(error.response), {
      // status 0 = no response (a transport error rather than an HTTP status).
      onNone: () => ({ status: error.response?.status ?? 0 }),
      onSome: (seconds) => ({ status: error.response?.status ?? 0, retryAfter: seconds }),
    }),
  );

/** Attach the current user's Graph bearer token to a request (request-scoped). */
const withBearer = Effect.fnUntraced(function* (request: HttpClientRequest.HttpClientRequest) {
  const userId = yield* CurrentUser;
  const token = yield* GraphToken;
  const accessToken = yield* token.forUser(userId);
  return HttpClientRequest.bearerToken(request, accessToken);
});

/** Build the configured client from whatever `HttpClient` is provided (Fetch at runtime, a stub in tests). */
const make = HttpClient.HttpClient.pipe(
  Effect.map((base) =>
    base.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(GRAPH_BASE)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson),
      HttpClient.mapRequestEffect(withBearer),
      // Bound time-to-response (not the streamed body) so a hung request fails fast; retried like any timeout.
      HttpClient.transformResponse((response) => Effect.timeout(response, "30 seconds")),
      // Non-2xx -> HttpClientError(StatusCodeError).
      HttpClient.filterStatusOk,
      // Retries 408/429/500/502/503/504 + transport/timeout, with jittered exponential backoff
      // (jitter avoids retry thundering-herd on a throttled tenant — ADR-0011 / PRD).
      HttpClient.retryTransient({
        schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered),
        times: 4,
      }),
      // A leftover status/transport failure or a timeout becomes the domain error. TokenUnavailable from
      // the auth step passes through untouched — it's raised in preprocess, outside this postprocess catch.
      HttpClient.catchTags({
        HttpClientError: (error) => Effect.fail(graphErrorFromHttp(error)),
        TimeoutError: () => Effect.fail(new GraphRequestError({ status: 0 })),
      }),
    ),
  ),
);

/** The configured Graph client as a service value (carries its request-scoped auth requirements). */
export class OneDriveHttp extends Context.Service<
  OneDriveHttp,
  HttpClient.HttpClient.With<GraphRequestError | TokenUnavailable, CurrentUser | GraphToken>
>()("OneDriveHttp") {}

/** Live layer — derives the configured client from the ambient `HttpClient`. */
export const OneDriveHttpLive = Layer.effect(OneDriveHttp)(make);

/** Default wiring: the configured client over the platform `fetch` (the Worker runtime). */
export const OneDriveHttpDefault = OneDriveHttpLive.pipe(Layer.provide(FetchHttpClient.layer));

// --- Response readers. They translate the response's own HttpClientError onto the domain error so
//     callers never touch it; a JSON shape mismatch (Graph contract drift) is a defect, not recoverable. ---

/** Decode a response JSON body with a schema. */
export const decodeJson =
  <S extends Schema.Top>(schema: S) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    HttpClientResponse.schemaBodyJson(schema)(response).pipe(
      Effect.catchTag("HttpClientError", (error) => Effect.fail(graphErrorFromHttp(error))),
      Effect.catchTag("SchemaError", (error) => Effect.die(error)),
    );

/** Read a response body as bytes. */
export const bytesOf = (response: HttpClientResponse.HttpClientResponse) =>
  response.arrayBuffer.pipe(
    Effect.catchTag("HttpClientError", (error) => Effect.fail(graphErrorFromHttp(error))),
    Effect.map((buffer) => new Uint8Array(buffer)),
  );
