import { Layer } from "effect";

/**
 * Observability seam merged into every runtime (see `makeRuntime`). The `Effect.fn`
 * spans across the app flow through whatever Tracer this layer provides — so this
 * is the single place tracing gets turned on (ADR-0007: observability via Sentry).
 *
 * **Currently a no-op** (`Layer.empty`) — the DSN isn't wired yet. Activation (P8),
 * once the Sentry DSN is configured:
 * - `@sentry/opentelemetry` (installed) provides the `SentrySpanProcessor` /
 *   `SentrySampler`, and `@sentry/cloudflare` provides the Worker client (DSN).
 * - Effect v4 has its own Tracer (it does not use the OpenTelemetry JS SDK), so the
 *   bridge is either Effect's `OtlpTracer` (`effect/unstable/observability`) pointed
 *   at Sentry's OTLP ingest endpoint, or an Effect→OTel-SDK tracer feeding
 *   `SentrySpanProcessor`. Decide when wiring the DSN.
 * - Privacy per ADR-0007: no Session Replay, no PII, strip SAS tokens from spans.
 */
export const Observability = {
  layer: Layer.empty,
};
