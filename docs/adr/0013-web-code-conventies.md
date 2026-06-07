# Web code conventions: English, branded identifiers, mappers in Schema transforms, Schema.TaggedError

The **Curation webapp** (`web/`) follows four cross-cutting code conventions, captured here so they are
discoverable in one place rather than scattered through the design docs. They build on ADR-0012 (Effect
v4 smol) and apply to all `web/` application code.

1. **English everywhere** — code, identifiers, comments, and new design docs are English. The ubiquitous
   language (CONTEXT.md) is Dutch; its terms are preserved via a glossary and the occasional `// ~Term`
   aside for traceability, but never as identifiers. *(The existing ADRs 0001–0012 and CONTEXT.md stay
   Dutch; this rule is not retro-applied to them.)*
2. **Anything resembling an identifier is a branded type** (`Schema.brand`) — e.g. `DriveItemId`,
   `UserId`, `WorkflowInstanceId`. An id can never be passed where a plain string is meant,
   and the distinct id-spaces never cross.
3. **Mappers live inside `Schema.transform` / `Schema.transformOrFail`**, never as standalone helper
   functions. Every representation conversion (wire ↔ domain, D1-row ↔ domain, Graph-item → domain) is a
   transform; `decode`/`encode` are the only place the mapping lives. One-way ingest is a
   `transformOrFail` with a deliberately failing `encode`.
4. **Errors are `Schema.TaggedError`**, not `Data.TaggedError`. Schema-based errors are serializable
   across the oRPC boundary, which is consistent with ADR-0012's rule that `effect/Schema` is the single
   contract source. You still get a real `Error`, a `Schema`, and a `_tag` for `Effect.catchTag`.

## Considered Options

- **Codify as conventions** (chosen): one ADR keeps the rules discoverable and lets ADR-0012 stay focused
  on the paradigm choice. Cheap to amend as the codebase grows.
- **Inline in ADR-0012**: fewer files, but mixes the paradigm decision with coding style and would bury
  the `TaggedError` correction inside an unrelated sentence.
- **Design-doc only**: leaves ADR-0012 literally contradictory on `TaggedError` and gives conventions no
  authoritative home.

## Consequences

- **Supersedes one line of ADR-0012:** its "errors = `Data.TaggedError`" is replaced by
  `Schema.TaggedError` (a pointer note is added there).
- **Branding cost:** constructing ids needs `.make()` / decoding; acceptable for the safety it buys.
- **Transforms over helpers:** lossy/one-way conversions are modelled with `transformOrFail` + failing
  `encode` rather than a bare function — slightly more ceremony, single source for both directions.
- **Standard Schema dependency:** the oRPC bridge assumes `effect/Schema` exposes the Standard Schema v1
  (`~standard`) shape on the smol line — gated by the ADR-0012 verify-at-build spike.

## Status

**Accepted (2026-06-06).** Conventions applied in `docs/design/domain-model.md`; the two ADR-0012
verify-at-build spikes (Standard Schema export, Gemini vision/structured output) gate the schema-as-
contract and AI-suggestion paths.
