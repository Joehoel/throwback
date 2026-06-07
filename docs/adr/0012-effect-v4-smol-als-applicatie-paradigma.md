# Effect v4 (smol) als applicatie-paradigma + package-selectie op de beta-lijn

De **Beheer-webapp** is Effect-native gebouwd op **Effect v4 (smol)** — `effect@4.0.0-beta.x` — omdat de gekozen IaC (ADR-0010, Alchemy v2 = `alchemy@2.0.0-beta`) `effect: >=4.0.0-beta.78` pint. De hele app deelt dus één Effect-runtime. Bewust **beta-op-beta**: Effect v4 stabiel bestaat nog niet (v3 stabiel = 3.21.x), maar op v4 blijven houdt app en infra op dezelfde Effect-versie en voorkomt twee Effect-installaties naast elkaar.

## Regel op de smol-lijn

Leun op de **core** `effect` (`Effect`, `Layer`, `Schema`, `Config`, `Data`, `Stream`, en `effect/unstable/{http,sql,ai}`) plus **drivers die op `4.0.0-beta.x` zijn gepubliceerd**. De v3-only meta-packages (`@effect/ai@0.36`, `@effect/sql@0.51`, `@effect/rpc`, `@effect/platform`, `@effect/ai-google@0.15`) zijn **niet bruikbaar** — ze zouden Effect v3 binnentrekken en de v4-invariant breken.

## Beslissingen

- **Validatie/contracts = `effect/Schema`**, hergebruikt op de wire via **Standard Schema v1**. oRPC valideert op `~standard`; Effect Schema levert die vorm, dus dezelfde schema's gaan naar `.input()/.output()` én de domeinlaag. `@orpc/zod` vervalt voor app-contracts.
- **Transport = oRPC + TanStack Query behouden**; de procedure-body draait een Effect-programma via een gedeelde `ManagedRuntime`/Layer. **`effect-orpc` afgewezen**: v3-only (peer `effect >=3.18.0`, geen v4-release) → zou de v4-invariant breken.
- **D1 = Alchemy provisioned + bindt (`env.DB`); `@effect/sql-d1@4.0.0-beta` is de query-laag** (core `effect/unstable/sql` `SqlClient` als Layer). App-tabellen (foto-index, write-status) hierlangs; **drizzle blijft enkel voor better-auth**.
- **AI = core `effect/unstable/ai` (`LanguageModel.generateObject`) + `@effect/ai-openai@4.0.0-beta`** tegen Gemini's OpenAI-compat endpoint, model `gemini-2.5-flash`. Geverifieerd: `@effect/ai-openai@4.0.0-beta.78` hangt enkel aan `effect@^4.0.0-beta.78` (zelf-consistent op v4). `@tanstack/ai-gemini` vervalt.
- **Config = `effect/Config`** (redacted secrets, vervangt t3-env); **errors = `Data.TaggedError`**; **outbound HTTP = `effect/unstable/http` HttpClient** (Graph/Geocoding/Gemini); **tests = `@effect/vitest@4.0.0-beta`**.

## Considered Options

- **Op Effect v4 (smol) blijven** (gekozen): één Effect-versie met Alchemy, maximaal Effect-native, ten koste van beta-risico en een kleinere ecosysteem-set.
- **Effect v3 stabiel + app los van Alchemy's Effect**: rijper ecosysteem (alle `@effect/*`-satellieten), maar twee Effect-versies in één tree (Alchemy v4 + app v3) → conflictrisico en gespleten paradigma.
- **Niet-Effect (Zod/drizzle/oRPC overal)**: simpelst, maar geen Effect-native servicelaag — tegen het doel.

## Consequences

- **Beta-blootstelling:** breaking changes tussen `4.0.0-beta.x`-releases zijn mogelijk; pin exact en upgrade bewust. Mitigatie: de meeste oppervlakte is core-`effect`, dat het stabielst is binnen v4.
- **Zod + drizzle blijven** bestaan, maar afgegrensd tot de better-auth-grens (die hangt niet aan Effect, dus geen versieconflict).
- **Verify-bij-bouw:** (1) Effect Schema's standard-schema-export aanwezig op smol; (2) vision-input + structured output overleven Gemini's OpenAI-compat-laag (anders die ene call hand-rollen op core HttpClient).

## Status

**Geaccepteerd (2026-06-05), bouw nog te starten.** Versies geverifieerd via npm: `alchemy@2.0.0-beta.52` → `effect >=4.0.0-beta.78`; `@effect/sql-d1` + `@effect/ai-openai` + `@effect/vitest` bestaan op `4.0.0-beta.78`; `effect-orpc@0.2.2` is v3-only.

> **Noot (2026-06-06):** de hierboven genoemde `errors = Data.TaggedError`-keuze is vervangen door
> `Schema.TaggedError` (serialiseerbaar over de oRPC-grens). Zie ADR-0013, dat ook de overige
> web-code-conventies vastlegt (Engels, branded identifiers, mappers in Schema-transforms).

> **Noot (2026-06-06):** "**drizzle blijft enkel voor better-auth**" vervalt — **drizzle gaat er
> helemaal uit**. better-auth gebruikt zijn **ingebouwde native D1-ondersteuning**: geef `env.DB`
> rechtstreeks aan `database` (geen drizzle, geen externe `kysely-d1`). App-tabellen op `@effect/sql-d1`;
> beide praten tegen dezelfde `env.DB`. **Geverifieerd** (spike #2 Part D, `web/spike/sql-d1/`):
> migraties + signup/signin werken op miniflare-D1, zonder extra packages. De externe `kysely-d1` faalt
> (SQLITE_AUTH bij introspectie — Part B); `better-auth-cloudflare` werkt maar is drizzle-gebaseerd +
> overbodig (Part C). Voordeel: −`drizzle-orm`/`drizzle-kit`/`better-sqlite3`, één migratiepad (platte
> SQL via Alchemy). Zie `docs/design/web-implementation-plan.md`.

> **Noot (2026-06-06):** de AI-keuze is herzien (draait "AI = `@effect/ai-openai`" én "`@tanstack/ai`
> vervalt" terug). `@effect/ai-openai@4.0.0-beta` is **niet bruikbaar met Gemini**: zijn `LanguageModel`
> praat alleen met OpenAI's Responses API (`/responses`), die Gemini's compat-laag niet heeft (404). In
> plaats daarvan **`@tanstack/ai` + `@tanstack/ai-gemini`** (native `@google/genai`-SDK) voor de
> model-call, met **`effect/Schema` via `Schema.toStandardJSONSchemaV1`** als `outputSchema`, gewrapt in
> `Effect.tryPromise` op de servergrens; **`@tanstack/ai-react`** voor de client-UI. Geverifieerd: spike
> #3, `web/spike/gemini-vision/`. ADR-0012 verify-bij-bouw #2 = ✅.
