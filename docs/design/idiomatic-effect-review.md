# Idiomatic-Effect review & rewrite plan — `/curate` + non-prototype code

Distilled from a multi-agent review (3 reference repos in `web/.context/` — effect-smol,
opencode, alchemy — held against 5 code clusters: metadata codec, local PhotoSource/crawl,
runtime/layers, db+server seam, UI↔Effect boundary). This is the **learnings record + working
checklist**; items are ticked off as they land (TDD, commit per slice).

## Overall read

The codebase is **already idiomatic at the load-bearing seams** — the hard parts are right:
pure byte-plumbing stays pure (ADR-0019), read projections are textbook decode-only
`Schema.decodeTo` + `SchemaGetter.forbidden` transforms reusing domain schemas, services are
`Context.Service` interfaces with impl-layers, and the client/server runtime split is a
deliberate browser-safety boundary. What's left is **not foundational rework but consistency
and edge discipline** — the idioms the code already knows, applied evenly.

### The five recurring levers

1. **Run the runtime only at the edge, once.** Server-edge rebuilds `SqlLive` per request
   (inline `Effect.provide`); the React edge scatters `LocalRuntime.runPromise(Effect.flatMap(Tag,…))`
   across three components. Both → one shared, memoized `ManagedRuntime` + a single thin action seam.
2. **Keep the typed error channel alive to the boundary.** `LocalSourceError`/`SqlError`/`ParseError`
   carry structured fields, then get flattened to `String(error)` at the first React/promise edge.
   Fix: `runPromiseExit` + `Match` on `_tag`; typed errors at the codec/server boundaries (ADR-0013).
3. **Spans everywhere a workflow runs.** `crawl`/`ingestFile`, metadata read/write, D1 repo methods
   are bare `function … { return Effect.gen(…) }` — the documented smell. → `Effect.fn("name")`
   so the Observability layer (ADR-0007) captures the persistence + crawl paths.
4. **Stream over imperative shell for IO fan-out.** The crawl is a mutable `CrawlSink` service +
   eager `for await` snapshot + `Effect.forEach`. Idiomatic v4 is a `Stream` pipeline that deletes
   the sink, the snapshot and the `provideService` plumbing — and makes concurrency a one-word knob.
5. **One spelling per pattern, namespaced ids.** Two ingest mappers, two valid spellings; bare
   service ids (`"Exif"`, `"PhotoSource"`) instead of namespaced; two server-edge dialects (Effect
   server-fns vs zod/in-memory oRPC). Consistency sweeps, not correctness.

## Cross-cutting themes (before/after)

### A — Where the runtime runs (biggest lever)

```ts
// before — review-server.ts: rebuilds SqlLive per request, bypasses the runtime
.handler(({ data }) =>
  Effect.runPromise(persistStatus(data.path, data.status).pipe(Effect.provide(SqlLive))))

// after — runtime composed once; handler is thin and layer-agnostic (restores the test seam)
export const ServerRuntime = makeRuntime(Layer.mergeAll(OneDriveLayer, SqlLive))
.handler(({ data }) => ServerRuntime.runPromise(persistStatus(data.path, data.status)))
```
Client side: collapse the three `LocalRuntime.runPromise` crossings into one action module;
components never import `LocalRuntime`/`Effect`.

### B — Error model at boundaries

Typed failures exist but die at the edge (`String(error)`, bare `catch {}`). Read path
`Effect.try({ catch: () => null }).pipe(orElseSucceed(EMPTY))` discards the cause twice — a corrupt
file is invisible.

```ts
// after — action returns Exit; describeError reads the typed field
const describeError = (cause: Cause.Cause<LocalSourceError>) =>
  Cause.failureOption(cause).pipe(
    Option.map((e) => Match.value(e).pipe(
      Match.tag("LocalSourceError", (x) => x.message),
      Match.orElse(() => "Onbekende fout"))),
    Option.getOrElse(() => "Onbekende fout"))

// read path — degrade but OBSERVE
Effect.try({ try: () => readExif(bin), catch: (cause) => new ExifReadError({ cause }) }).pipe(
  Effect.tapError((e) => Effect.logWarning("exif read failed, degrading to EMPTY")
    .pipe(Effect.annotateLogs("cause", e.cause))),
  Effect.orElseSucceed(() => EMPTY))
```
Classify errors where the bytes live (codec owns `MetadataWriteError`), not at the consumer.

### C — Service vs pure boundary; spans

Two asymmetries: (1) `PhotoMetadata.write` is a pure `string -> string` method on an otherwise-Effect
service — throwing byte work with no typed channel and no span; (2) `XmpReaderLive` calls
`Effect.runSync(readXmpDescription(…))` *inside* a service method (runtime mid-service) because the
`Xmp` interface was drawn sync while `Exif`'s was Effect. Inner helpers (`crawl`/`ingestFile`, repo
methods) lack spans; the public `local.*` methods already use `Effect.fn` correctly.

```ts
// after
readonly write: (b, m, e) => Effect.Effect<string, MetadataWriteError> // Effect.fn("PhotoMetadata.write")
readonly readDescription: (jpegBinary) => Effect.Effect<string | null>  // both backends uniform
```

### D — Crawl: imperative shell → Stream

`CrawlSink` (a service used as a mutable accumulator) + `collectEntries` (eager `for await`) +
`Effect.forEach` → a `Stream` pipeline; `ingestFile` becomes the `mapEffect` element returning its
row. Mirrors opencode `ripgrep.ts` (stdout → Stream → mapEffect → runCollect). Concurrency becomes
a one-word knob.

### E — Schema/projection placement

`facts.ts` and `PhotoFromLocalFile` are exemplary — leave them. Leaks: year-from-path is hand-written
regex inside `ingestFile` (splits the Photo projection across crawl + mapper, duplicates
`graph.ts:YearFromPath`); the two ingest mappers use two spellings (`decodeTo+forbidden` vs
`SchemaTransformation.transform` + lossy no-op encode). → move year derivation into the mapper
(`YearFromSegments`), standardize on `decodeTo + SchemaGetter.forbidden`.

### F — Runtime composition & observability

Two `ManagedRuntime`s with no shared `memoMap` (shared layers build twice); no `dispose()`;
`Observability` exported as `{ layer: Layer.empty }` (wrapper-object → enabling telemetry is a
surface refactor). → one shared `memoMap`, `dispose()`, top-level `enabled`/`layer` + `Layer.unwrap`.

## Roadmap (working checklist)

| # | Change | Effort/Impact | Files | Status |
|---|--------|---------------|-------|--------|
| 1 | Server-edge via shared `ServerRuntime = makeRuntime(mergeAll(OneDriveLayer, SqlLive))`; drop per-call `Effect.provide(SqlLive)` | low / **high** | `effect/runtime.ts`, `runtime.ts`, `review-server.ts` | ✅ |
| 2 | Collapse 3 client runtime crossings into one action module; components never touch `LocalRuntime`/`Effect` | low / **high** | `curate.tsx`, `photo-card.tsx`, `actions.ts` | ✅ |
| 3 | Observe-then-degrade on EXIF read (`logWarning` + cause before `orElseSucceed(EMPTY)`) | low / med | `codec.ts`, `exifreader.ts` | ✅ |
| 4 | `Effect.fn` spans on inner crawl helpers + D1 repo methods | low / med | `local/client.ts`, `db/local-review.ts`, `db/photo-index.ts` | ✅ |
| 5 | `Xmp.readDescription` returns `Effect`; delete in-service `Effect.runSync` | low / med | `exifreader.ts`, `codec.ts` | ✅ |
| 6 | Cross boundaries with `runPromiseExit` + `Match` on `_tag` (`describeError`); kill `String(error)` + bare `catch {}` | med / **high** | `curate.tsx`, `folder-browser.tsx`, `photo-card.tsx`, `review-server.ts` | ✅ |
| 7 | `PhotoMetadata.write` → `Effect.fn` with `MetadataWriteError`; `client.ts` `mapError` into `LocalSourceError` | med / **high** | `codec.ts`, `exif.ts`, `local/client.ts` | ✅ |
| 8 | Shared `memoMap` + `dispose()`; `Observability` → top-level `enabled`/`layer` + `Layer.unwrap` | low / med | `effect/runtime.ts`, `observability.ts` | ✅ |
| 9 | Year/path derivation into the mapper (`YearFromSegments`); `ingestFile` emits raw input; share YYYY regex | med / med | `local/client.ts`, `local/mapper.ts`, `graph.ts` | ✅ |
| 10 | `CrawlSink` + `collectEntries` + `Effect.forEach` → `Stream` pipeline | **high** / **high** | `local/client.ts` | ✅ |
| 11 | Namespace service/error ids (`@throwback/…`); fix the `Effect.flatMap(Tag,…)` lint-workaround at config level, restore `Tag.use` | low / low | services + oxlint config | ✅ |
| 12 | One canonical server-edge dialect (oRPC w/ effect/Schema input on `ServerRuntime`, `Schema.TaggedError` over the wire); fold the review server-fn in | **high** / med | `orpc/*`, `review-server.ts` | 🟡 see note |

Sequencing: #1 unblocks #6 (server) + #12; #2 unblocks #6 (client) + #11. #4-5-7 are the
metadata/crawl span-&-error pass. #10 subsumes `CrawlSink` (then #11 only renames) and absorbs #4's
`ingestFile` into the `mapEffect` element.

## Leave alone (already idiomatic — do not churn)

- **`facts.ts`** — near-perfect `decodeTo` + `SchemaGetter.forbidden`, Option-based XMP-over-EXIF.
- **The imperative lossless-write internals** (`writeExif`/`writeXmp`/`writePng`) — ADR-0019 mandates
  imperative; the *only* write change is wrapping it in Effect + a typed error (#7), never the internals.
- **Pure byte modules** (`binary`/`segments`/`reader`/`exif`/`xmp`/`png`) — correctly plain functions.
- **`PhotoFromLocalFile`**, the `ExifFake`/test-double seams, typed-`LocalSourceError` Promise boundaries.
- **The `LocalRuntime` vs `OneDriveRuntime` split** — a deliberate browser-safety boundary; do NOT
  collapse into one app Layer (would pull cloudflare-workers/better-auth into the browser bundle).
- **`folder-tree.ts`** and **`mergeReviewStatuses`** — pure code stays pure.
- **Row codecs in the D1 repos** — `encodeKeys`, `decodeUnknownEffect`, branded ids. Only spans (#4)
  and call-site wiring (#1) need work, not the Schema layer.

## #12 decision — keep the two server-edge dialects (deliberate, not a smell)

Consolidating the D1 review-status path from a TanStack `createServerFn` into an oRPC
procedure was **decided against**, because it would *regress* the client/server boundary:

- `createServerFn`'s handler body (with the `DbRuntime`/`cloudflare:workers` binding) is
  **stripped from the client bundle** by the TanStack compiler — exactly what a client-only route
  (`/curate`) needs. An oRPC procedure touching D1 is statically imported by the isomorphic
  `orpc/client.ts`, so it would pull `cloudflare:workers` into the browser bundle.
- Injecting D1 via oRPC **context** (so the router module stays env-free) conflicts with the
  existing `createRouterClient(router, { context: { headers } })` — the SSR client can't supply a
  request-scoped `db`, and the types don't line up.

So the two "dialects" have **different jobs**, not redundant ones: **oRPC** for general client↔server
RPC, **`createServerFn`** for server-only-binding access from a client route. Both already validate
input with **effect/Schema** on the real path (`review-server.ts`), so there is no validation-library
split to fix. The remaining nit — the demo `orpc/router/todos.ts` uses `zod` — is left as-is (demo
code; not worth churning the oRPC example). Service-id namespacing (`@throwback/…`, part of lever 5)
is likewise a cosmetic sweep left for later.

## Status — complete

Landed (TDD, commit per slice, all green): **#1–#11** plus a real interop bug the review surfaced
(the XMP namespace was space- not NUL-terminated, so ExifTool/Lightroom/exifreader couldn't read our
XMP). **#12** is a reasoned non-change (above). The codebase's load-bearing seams were already
idiomatic; this pass brought the *edges* (runtime crossings, typed errors, spans, the Stream crawl)
up to the same bar.
