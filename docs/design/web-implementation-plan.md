# Curation webapp — implementation plan

> **Status:** plan (2026-06-06), build not yet started. Sequences the build of the **Curation webapp**
> (`web/`) per `docs/design/domain-model.md`, ADR-0002/0007/0008/0009/0010/0011/0012/0013, and the
> `@effect/sql-d1` research (`docs/research/` / this session). Companion to the domain model — that doc
> is the *what*, this is the *order*.

## Guiding decisions (settled)

- **Stack:** Effect v4 smol (`effect@4.0.0-beta.x`), TanStack Start on Cloudflare Workers (ADR-0012).
- **SQL:** app tables via **`@effect/sql-d1@4.0.0-beta`** + core `effect/unstable/sql` `SqlClient`;
  **better-auth via its built-in native D1 support — pass `env.DB` to `database`, no drizzle, no external
  dialect** (verified spike #2 Part D, `web/spike/sql-d1/`: migrations + auth work with zero extra deps;
  the external `kysely-d1` fails on D1, and `better-auth-cloudflare` is drizzle-based + unneeded). Both
  libraries hit the same `env.DB`; all migrations are plain SQL applied by Alchemy.
- **Conventions:** English; branded ids; mappers in `Schema.transform`; `Schema.TaggedError` (ADR-0013).
- **Infra is a different session's job:** ADR-0010 (Alchemy v2) owns `package.json`, deps, lockfile,
  `wrangler.jsonc`→`alchemy.run.ts`, `vite.config.ts`, `drizzle.config.ts`, and all bindings/resources.

## Ownership & collision map

| Owned by **Alchemy session** (don't touch) | Owned by **this/app work** (safe) |
|---|---|
| `package.json`, lockfile, deps install | `src/domain/**` |
| `wrangler.jsonc` (delete) → `alchemy.run.ts` | `src/orpc/router/**`, `src/orpc/**` |
| `vite.config.ts` (drizzle.config.ts deleted) | `src/db/**` app tables + `@effect/sql-d1` layer; better-auth native D1 |
| Bindings: `DB` (D1), Workflows, secrets/AI | `src/services/**`, `src/runtime/**` |
| D1 + Workflows resources, dev/deploy loop | `src/routes/**` (UI), `web/spike/**`, `docs/**` |

## Dependency graph (phases)

```
P0 spikes ─┬─> (gate: verified v4 API)
           └─> P1 deps/infra (Alchemy) ─┬─> P2 domain ─┬─> P3 persistence ─┐
                                        │              └─> P4 services ─────┼─> P5 oRPC ─┬─> P6 write path (Workflows)
                                        │                                   │            └─> P7 UI
                                        └───────────────────────────────────┘            P8 observability + tests (cross-cutting)
```

---

## P0 — De-risk spikes (gate everything; collision-free, own deps in `web/spike/`)

The whole domain doc is **v3-shaped and unverified on v4** — these retire that risk before any `src/` code.

1. **`spike/standard-schema`** — `effect@4.0.0-beta.78`, Node/tsx. Confirm on the smol line:
   `Schema.Struct(...).~standard` export shape oRPC needs; `transform`/`transformOrFail` signatures;
   `fromKey`, `optionalWith({ nullable })`, `parseJson`, `brand`, `DateTimeUtc`, `Schema.TaggedError`,
   `ParseResult`. **Output:** a verified v4 cheat-sheet + corrections back into `domain-model.md`.
2. **`spike/sql-d1`** — `@effect/sql-d1@4.0.0-beta` + `effect/unstable/sql` against **miniflare** D1
   (reuse the existing `web/spike` miniflare pattern). Confirm `D1Client.layer({ db })`, `sql` tagged
   template, `Schema`-decoded rows. **✅ DONE** (`web/spike/sql-d1/`): Part A (`@effect/sql-d1` +
   `PhotoFromRow`) and Part D (better-auth **native D1** — `database: env.DB`, drizzle-free, zero extra
   deps) both pass on miniflare; external `kysely-d1` fails (Part B), `better-auth-cloudflare` works but
   is unneeded (Part C). See its `FINDINGS.md`.
3. **`spike/gemini-vision`** — **✅ DONE** (ADR-0012 verify #2). `@effect/ai-openai` is **incompatible**
   with Gemini (Responses-API-only → 404). Chosen path: **`@tanstack/ai` + `@tanstack/ai-gemini`** (native
   `@google/genai` SDK), `outputSchema = Schema.toStandardJSONSchemaV1(Suggestion)`, wrapped in
   `Effect.tryPromise`; `@tanstack/ai-react` for the client. Vision + structured output verified
   (`checkTanstack.mjs`). See its `FINDINGS.md`.

**Done when:** all three pass; `domain-model.md` API is corrected to verified v4; the dependency manifest
(exact pins) is handed to the Alchemy session.

## P1 — Dependencies & project realignment (Alchemy session; this session feeds it)

- **Add (pin exact):** `effect@4.0.0-beta.78`, `@effect/sql-d1@4.0.0-beta.78`, `@effect/vitest@4.0.0-beta.78`.
- **AI deps (keep/add):** `@tanstack/ai`, `@tanstack/ai-gemini`, `@tanstack/ai-react` (spike #3). **NOT**
  `@effect/ai-openai` — incompatible with Gemini.
- **Drop:** `@orpc/zod` (app contracts move to `effect/Schema` ~standard), the **unused** `@tanstack/ai-*`
  providers (`-anthropic`/`-ollama`/`-openai`), and
  **all of drizzle**: `drizzle-orm`, `drizzle-kit`, `better-sqlite3`, `@types/better-sqlite3`,
  `drizzle.config.ts`, `drizzle/` migrations, `src/db/auth-schema.ts`, the `db:*` scripts.
- **Add for auth:** nothing — better-auth's native D1 support needs only the raw `env.DB` binding (kysely
  is already a better-auth dep; keep the `kysely` override). Do NOT add external `kysely-d1` (fails on D1)
  or `better-auth-cloudflare` (drizzle-based + unneeded features).
- **Keep:** `zod` only because better-auth depends on it.
- **Bindings:** `DB` (D1), Workflows, AI/Gemini secret via Alchemy `StoreSecret`, `BETTER_AUTH_URL`.
- **Decruft (this session can list, Alchemy applies):** remove the `todos` oRPC example, CRA assets
  (`logo192/512`, `drizzle.svg`), and the unused `@tanstack/ai-*` provider wiring (keep `@tanstack/ai`,
  `-gemini`, `-react`).

**Done when:** `effect` resolves on v4 across the tree (one Effect version), `npm run build` green, the
D1 binding is reachable per-request as `env.DB`.

## P2 — Domain core (`src/domain/**`)

Lift `domain-model.md` (with P0 corrections) into `src/domain/`:

- `ids.ts` — `DriveItemId`, `UserId`, `WorkflowInstanceId` (branded).
- `photo.ts` — `Location`, `Description`, `Suggestion`, `ReviewStatus`, `Photo`, `Event`, `Orientation`.
- `graph.ts` — `GraphDriveItem` + `PhotoFromGraphItem` (declarative projection).
- `write.ts` — `WriteKind`, `WriteStatus`, `WritePayload`, `WriteJob`.
- `errors.ts` — the `Schema.TaggedError` taxonomy.
- `runtime.ts` — `ManagedRuntime` + the app `Layer` composition skeleton (filled by later phases).

**✅ DONE (2026-06-06):** `src/domain/{ids,photo,write,errors,graph,index}.ts` lifted from the verified v4
doc. Runtime-verified 10/10 via `scripts/verify-domain.ts` (incl. the absent-Graph-key projection) and
`tsc --noEmit` clean for `src/domain`. `runtime.ts` deferred to P3/P4 (no services to compose yet);
`PhotoFromRow` row codec deferred to P3 (persistence).

## P3 — Persistence (`src/db/**`, `@effect/sql-d1`)

- **better-auth via native D1** — ✅ DONE (this session): `betterAuth({ database: env.DB })`, drizzle
  removed; auth tables as native camelCase SQL in `drizzle/0000_naive_vector.sql` (regen via
  `web/spike/sql-d1/gen-auth-sql.mjs`), applied by Alchemy `migrationsDir`.

- **Migrations** (one path — plain SQL applied by Alchemy): `photo_index` (§4 columns — nullable
  `description`/`location`, no boolean flags) and `write_jobs` (the pending-writes queue: photo id,
  payload JSON, status, attempts, `workflow_instance_id`, error — ADR-0009/0011). better-auth's own
  tables are generated via the better-auth CLI and applied through the **same** Alchemy/D1 path (no
  drizzle-kit).
- **better-auth via native D1** built per-request (`betterAuth({ database: env.DB, ... })`); drizzle
  adapter + `auth-schema.ts` removed. *(Verified: spike #2 Part D.)*
- **`SqlClient` layer** from `env.DB` (per-request — ADR-0009; same lifetime model as better-auth).
- **`PhotoFromRow`** codec wired; repository services:
  - `PhotoIndexRepo` — upsert (from crawl), query review queue (`WHERE description IS NULL` etc.),
    update `review_status`.
  - `WriteQueueRepo` — enqueue, read pending (server-side flusher), update status.

**✅ DONE (2026-06-06):** `@effect/sql-d1` added; migrations `drizzle/0001_photo_index.sql` +
`0002_write_jobs.sql`; `src/db/photo-index.ts` (`PhotoFromRow` + `upsert`/`reviewNext`/`setReviewStatus`),
`src/db/write-queue.ts` (`WriteJobFromRow` + `enqueue`/`pending`/`get`/`setStatus`), `src/db/client.ts`
(runtime `SqlLive` from `env.DB`). Repos are modules of `SqlClient`-requiring Effects (testable via
layer-swap; a `Context.Service` wrapper is an optional follow-up). **Verified 8/8 against miniflare D1**
(`scripts/verify-db.ts`: review-queue filters, JSON `location` round-trip, re-crawl preserves
`review_status`, write-queue enqueue→pending→complete) + `tsc` clean for `src/db`. `runtime.ts`
(ManagedRuntime/Layer composition) still deferred to P5 when oRPC wires it.

## P4 — Outbound services (`src/services/**`, core `effect/unstable/http`)

- `GraphClient` — token via better-auth `getAccessToken({ providerId: 'microsoft', userId })`
  **sessionless** (ADR-0011); children-crawl of the root folder; `description` PATCH (ADR-0002); item
  bytes download + re-upload (for the write path).
- `SuggestionClient` — `@tanstack/ai` `chat({ adapter: createGeminiChat("gemini-2.5-flash", key) })`
  wrapped in `Effect.tryPromise`; `outputSchema = Schema.toStandardJSONSchemaV1(Suggestion)`, then
  `Schema.decodeUnknownSync(Suggestion)` on the result. Key/model via `effect/Config` (spike #3).
- `GeocodingClient` — reverse geocode for the map UI *(can land later; optional)*.
- `Config` via `effect/Config` (redacted secrets), `Telemetry` façade stub (P8).

**Done when:** crawl returns `GraphDriveItem[]`; PATCH + download/upload verified against a test account.

## P5 — oRPC contract layer (`src/orpc/**`)

Replace the `todos` example. Implement §6 procedures, inputs/outputs as `effect/Schema` via `~standard`;
bodies run Effect programs on the shared `ManagedRuntime`/Layer:

`library.connect` · `library.pickRootFolder` · `index.resync` (crawl → `PhotoIndexRepo`) ·
`review.next` · `suggest.description` · `approve.description` · `approve.location` · `review.skip` ·
`write.status`.

**Done when:** the review loop works end-to-end against miniflare (pick folder → crawl → step → skip).

## P6 — Write path (Cloudflare Workflows, ADR-0011)

- **Per-photo workflow:** token → download bytes → inject EXIF GPS+Orientation (piexifjs, already
  spiked) → re-upload → verify `location` facet → update `write_jobs` + `review_status`. **JPEG-only**
  for location/orientation; other formats skipped for location.
- **Description write:** cheap Graph PATCH outside the workflow.
- **Optimistic UI contract:** `approve.*` sets `review_status` locally + enqueues a `write_job`; the
  workflow advances status; UI polls `write.status`.
- Workflow class bound via Alchemy (ADR-0010/0011); triggered with `notifier.create` + `instance.status`.

**Done when:** an approved location write round-trips to OneDrive and the `location` facet verifies;
status reflects in D1 and survives a tab close.

## P7 — UI (`src/routes/**`)

Auth shell (better-auth, exists) → root-folder picker → **review stepper**: photo + current
`description`/`location`, AI suggestion (approve/edit/skip) via **`@tanstack/ai-react`**, map for location,
straighten via `Orientation`. Optimistic mutations through TanStack Query + oRPC; manual re-sync button.

**Done when:** dad can walk photos missing a description/location and approve fixes; UI stays responsive
via the optimistic queue.

## P8 — Observability & tests (cross-cutting, ADR-0007)

Sentry via the `Telemetry` façade — **no Session Replay**, no PII, strip SAS tokens from breadcrumbs;
instrument crawl/delta/login/Graph durations. `@effect/vitest` across domain transforms, repos, services.

---

## Risks & notes

- **Beta-on-beta (ADR-0012):** pin every `*-beta.78` exactly; upgrade deliberately. Most surface is core
  `effect`, the most stable part of v4.
- **Spikes are the long pole for confidence** — P2+ assumes their verified API. Don't lift `src/` schemas
  before P0 corrects the doc.
- **D1 carries content now (ADR-0009 amended):** `description`/`location` live in the index; staleness is
  handled by re-sync + post-write status update, per ADR-0009's existing mirror pattern.
- **Manual deploy first** (single-user tool, ADR-0010); GitHub Actions later.

## Suggested first move

**P0 is ✅ COMPLETE** (all three spikes green — `web/spike/{standard-schema,sql-d1,gemini-vision}/`): v4
Schema surface verified + doc ported; `@effect/sql-d1` + better-auth native D1 proven; Gemini vision +
structured output via `@tanstack/ai`. Verified decisions: drop drizzle, drop `@effect/ai-openai`, AI via
`@tanstack/ai(-gemini/-react)`.

Next: **P1** — hand the verified dependency manifest to the Alchemy session (it owns `package.json`), then
**P2** (lift the v4 domain schemas into `src/domain/`). P2+ can start in the app safe-zones as soon as P1
lands deps.
