import { Layer } from "effect";
import { OneDriveClient, OneDriveClientLive } from "#/domains/onedrive/client.ts";
import { OneDriveHttpDefault } from "#/domains/onedrive/http-client.ts";
import { GraphTokenLive } from "#/domains/onedrive/token-live.ts";
import { makeRuntime } from "#/effect/runtime.ts";

/**
 * App runtime composition (ADR-0012). Worker-only: pulls in `GraphTokenLive`
 * (→ better-auth / `cloudflare:workers`) and the platform `fetch` via
 * `OneDriveHttpDefault`.
 *
 * `OneDriveLayer` wires the OneDrive service over its default HTTP client + the
 * better-auth token source. `OneDriveRuntime` is a lazy `ManagedRuntime` that
 * merges the `Observability` layer, so the `Effect.fn` spans export once tracing
 * is wired (ADR-0007). P5 (oRPC) runs procedure-body Effects on this runtime; it
 * will be extended to also provide `SqlLive` (`src/db/client.ts`). Tests build
 * their own composition with a stub `HttpClient` + stub `GraphToken`.
 */
export const OneDriveLayer: Layer.Layer<OneDriveClient> = OneDriveClientLive.pipe(
  Layer.provide(Layer.mergeAll(OneDriveHttpDefault, GraphTokenLive)),
);

export const OneDriveRuntime = makeRuntime(OneDriveClient, OneDriveLayer);
