# AGENTS — Curation webapp (`web/`)

TanStack Start on Cloudflare Workers, **Effect v4 smol** (`effect@4.0.0-beta.78`). See
`../docs/` for the PRD, CONTEXT (ubiquitous language), and ADRs (esp. 0012/0013 for the Effect
conventions, 0007 for observability).

## Read `.context/` before writing Effect business logic

When you build anything in Effect that is **business logic** (a service, a Layer, a domain
workflow, an outbound client), **read `.context/` first for inspiration** — these are real,
pinned references, not training-data guesses:

- **`.context/effect-smol/`** — `Effect-TS/effect-smol`, the Effect v4 source, pinned **exactly**
  to the installed `4.0.0-beta.78`. The API truth (impls + JSDoc the dist drops). Map:
  `node_modules/effect/dist/<P>.{js,d.ts}` → `.context/effect-smol/packages/effect/src/<P>.ts`.
  A `PreToolUse` hook nudges any read of `node_modules/effect` toward this source.
- **`.context/alchemy/`** — `alchemy-run/alchemy-effect` (Alchemy **v2**, "Infrastructure as
  Effects", the line we depend on). Heavy, idiomatic Effect: `Context.Service` services, `Layer`
  composition, `Effect.fn` spans. The closest large-scale model for our service style.
- **`.context/opencode/`** — `anomalyco/opencode`. Real Effect service patterns (the OneDrive
  client's shape was informed by its `core/src/models-dev.ts`).

Mirror what they do; don't reinvent. Prefer existing Effect abstractions over hand-rolled control flow.

## House conventions (this codebase)

- Services as `Context.Service` **interfaces**; consumers depend on the interface, layers wire the
  impl (build against interfaces, not implementations).
- `Effect.fn("name")` (named spans, for OTel) / `Effect.fnUntraced` for service methods — not bare
  `Effect.gen`. Lean on `Stream`/`Option`/`Match` and other Effect primitives over imperative
  loops and ternaries.
- English code; branded ids; mappers in `Schema` transforms; `Schema.TaggedError` (ADR-0013).
- `.context/` is gitignored and excluded from oxlint — reference only, never edited or shipped.
