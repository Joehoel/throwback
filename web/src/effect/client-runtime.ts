import { LocalPhotoSourceLive } from "#/domains/local/client.ts";
import { makeRuntime } from "./runtime.ts";

/**
 * Browser-side `ManagedRuntime` for client-only Effect services — distinct from
 * the Worker-only `OneDriveRuntime` (`runtime.ts`), which pulls in better-auth /
 * `cloudflare:workers` and can't load in the browser. The `Observability` layer
 * `makeRuntime` merges is currently a no-op, so this is browser-safe.
 *
 * Run programs that require `PhotoSource`:
 * `LocalRuntime.runPromise(PhotoSource.use((s) => s.ingest(handle)))`.
 */
export const LocalRuntime = makeRuntime(LocalPhotoSourceLive);
