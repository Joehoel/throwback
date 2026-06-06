import { type Context, type Effect, Layer, ManagedRuntime } from "effect";
import { Observability } from "./observability.ts";

/**
 * A lazy `ManagedRuntime` for a root service, with the `Observability` layer merged
 * in so the app's `Effect.fn` spans export once tracing is wired (ADR-0007). The
 * runtime builds on first use and is reused after. (Adapted from anomalyco/opencode
 * `core/src/effect/runtime.ts`.)
 *
 * Run programs by selecting from the service: `rt.runPromise((s) => s.method(args))`.
 */
export function makeRuntime<Id, Shape, E>(service: Context.Service<Id, Shape>, layer: Layer.Layer<Id, E>) {
  let rt: ManagedRuntime.ManagedRuntime<Id, E> | undefined;
  const runtime = (): ManagedRuntime.ManagedRuntime<Id, E> =>
    (rt ??= ManagedRuntime.make(Layer.provideMerge(layer, Observability.layer)));

  return {
    runtime,
    runPromise: <A, Err>(fn: (service: Shape) => Effect.Effect<A, Err, Id>, options?: Effect.RunOptions) =>
      runtime().runPromise(service.use(fn), options),
    runPromiseExit: <A, Err>(fn: (service: Shape) => Effect.Effect<A, Err, Id>, options?: Effect.RunOptions) =>
      runtime().runPromiseExit(service.use(fn), options),
    runFork: <A, Err>(fn: (service: Shape) => Effect.Effect<A, Err, Id>) => runtime().runFork(service.use(fn)),
  };
}
