import { Context, Effect, Layer, Option, Schedule } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, Headers } from "effect/unstable/http";
import type { HttpClientError } from "effect/unstable/http";
import { GraphRequestError } from "#/domain/errors.ts";

/**
 * The custom HTTP client for Microsoft Graph (the OneDrive bounded context),
 * built on the unstable `effect/unstable/http` `HttpClient` (ADR-0012 P4). It
 * centralizes everything every Graph call shares — base URL, JSON `Accept`,
 * throttle retry, and translation of transport/status failures into the domain
 * `GraphRequestError` — so `client.ts` only deals in domain types.
 *
 * Per-user bearer tokens are NOT baked in here: the token is per-call, added by
 * `client.ts` on each request (it depends on `GraphToken`).
 */

/** Graph v1.0 base. `client.ts` strips this from absolute `@odata.nextLink`s before re-issuing. */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Read `Retry-After` (seconds) off a Graph throttling response, if present and numeric. */
const retryAfterSeconds = (response: HttpClientError.HttpClientError["response"]): number | undefined => {
  if (response === undefined) {
    return undefined;
  }
  const raw = Option.getOrUndefined(Headers.get(response.headers, "retry-after"));
  const seconds = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
};

/** Map a transport/status failure onto the domain error. Exported for body-read sites in `client.ts`. */
export const graphErrorFromHttp = (error: HttpClientError.HttpClientError): GraphRequestError => {
  // 0 = no response (a transport error rather than an HTTP status).
  const status = error.response?.status ?? 0;
  const retryAfter = retryAfterSeconds(error.response);
  return new GraphRequestError(retryAfter === undefined ? { status } : { status, retryAfter });
};

/** Build the configured client from whatever `HttpClient` is provided (Fetch at runtime, a stub in tests). */
const make: Effect.Effect<HttpClient.HttpClient.With<GraphRequestError>, never, HttpClient.HttpClient> = Effect.gen(
  function*  make() {
    const base = yield* HttpClient.HttpClient;
    return base.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(GRAPH_BASE)),
      HttpClient.mapRequest(HttpClientRequest.acceptJson),
      // Non-2xx -> HttpClientError(StatusCodeError).
      HttpClient.filterStatusOk,
      // Retries 408/429/500/502/503/504 + transport/timeout, with jittered exponential backoff
      // (jitter avoids retry thundering-herd on a throttled tenant — ADR-0011 / PRD).
      HttpClient.retryTransient({ schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered), times: 4 }),
      HttpClient.catch((error) => Effect.fail(graphErrorFromHttp(error))),
    );
  },
);

/** The configured Graph client as a service value. */
export class OneDriveHttp extends Context.Service<OneDriveHttp, HttpClient.HttpClient.With<GraphRequestError>>()(
  "OneDriveHttp",
) {}

/** Live layer — derives the configured client from the ambient `HttpClient`. */
export const OneDriveHttpLive: Layer.Layer<OneDriveHttp, never, HttpClient.HttpClient> =
  Layer.effect(OneDriveHttp)(make);

/** Default wiring: the configured client over the platform `fetch` (the Worker runtime). */
export const OneDriveHttpDefault: Layer.Layer<OneDriveHttp> = OneDriveHttpLive.pipe(
  Layer.provide(FetchHttpClient.layer),
);
