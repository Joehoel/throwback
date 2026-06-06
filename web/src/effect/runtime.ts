import { Layer, ManagedRuntime } from "effect";
import type { Effect } from "effect";
import { Observability } from "./observability.ts";

/**
 * A lazy `ManagedRuntime` for an app layer, with the `Observability` layer merged
 * in so the app's `Effect.fn` spans export once tracing is wired (ADR-0007). The
 * runtime builds on first use and is reused after. (Adapted from anomalyco/opencode
 * `core/src/effect/runtime.ts`.)
 *
 * Run programs that require the layer's services:
 * `rt.runPromise(OneDriveClient.use((s) => s.method(args)))`.
 */
export function makeRuntime<RIn, E>(layer: Layer.Layer<RIn, E>) {
  let rt: ManagedRuntime.ManagedRuntime<RIn, E> | undefined;
  const runtime = (): ManagedRuntime.ManagedRuntime<RIn, E> =>
    (rt ??= ManagedRuntime.make(Layer.provideMerge(layer, Observability.layer)));

  return {
    runtime,
    runPromise: <A, Err>(effect: Effect.Effect<A, Err, RIn>, options?: Effect.RunOptions) =>
      runtime().runPromise(effect, options),
    runPromiseExit: <A, Err>(effect: Effect.Effect<A, Err, RIn>, options?: Effect.RunOptions) =>
      runtime().runPromiseExit(effect, options),
    runFork: <A, Err>(effect: Effect.Effect<A, Err, RIn>) => runtime().runFork(effect),
  };
}
