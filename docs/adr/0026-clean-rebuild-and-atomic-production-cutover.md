# Clean rebuild and atomic production cutover

The integrated Curation webapp is rebuilt as one Graph-only product rather than evolved through adapters
between the local `/curate` MVP and the Splitscreen prototypes. The existing code has no production users
or durable production data to preserve. We therefore keep only the validated visual composition and build
the domain, persistence, transport, and JPEG implementation against the accepted contracts from scratch.

## Production ownership

The final application has three explicit source boundaries:

- `src/server/**` owns Effect schemas, `HttpApi`, services and Layers, Better Auth integration, D1
  repositories, Graph and Gemini clients, delta ingest, dispatchers, Workflows, and the streaming JPEG
  codec. Browser modules cannot import this tree.
- `src/client/**` owns React, TanStack Router/Query/Store integrations, the generated Fetch/Query/Valibot
  client, the shadcn/ui component sources selected by ADR-0028, and browser-only presentation state. It
  cannot import Effect or server modules.
- `src/routes/**` contains thin route composition. Page routes import client entry points; dedicated server
  routes mount auth, `HttpApi`, OpenAPI, and documentation handlers without exporting server domain types
  to the browser.

There is no general shared domain-type directory. The server contract is authoritative and generated wire
DTOs are the browser vocabulary. Build-time dependency rules, typecheck, lint, and production bundle scans
enforce these directions and prove that neither Effect nor server implementation code enters client
chunks.

The `Review.*` compound-component shape is the only production UI starting point retained from the
Splitscreen prototype. Its provider, props, data types, and behavior are rewritten around generated DTOs
and production queries. The validated responsive/status behavior from `responsive-review.tsx` is ported
into these components; its mock data, timers, state model, and route are not retained.

TanStack Store replaces XState. One store instance is created for the mounted review route and owns only
the unconfirmed Description, Location and Orientation buffer plus panel, dialog, help, focus, and map
presentation state. TanStack Router owns Library/Event/Foto identity and filter/search state. TanStack
Query owns every server read, mutation, Concept confirmation, Suggestion, command, retry, and polling
state. When confirmed Foto or Concept data changes, a pristine buffer adopts it; a dirty buffer remains
visible until its serialized autosave resolves. A changed Foto projection follows the explicit stale-
Concept re-evaluation contract and is never silently rebased by the Store.

## Routes

The canonical bookmark is
`/libraries/$libraryId/events/$eventId/photos/$photoId`. Opaque ids are parsed with generated Valibot
schemas. Review filter and map viewport may remain validated search parameters; cursor identity never
moves into Store or browser persistence.

`/` resolves current server state and redirects:

- without a Better Auth session, to sign-in;
- without a claimed Curator, Graph connection, selected root folder, or active projection, to the relevant
  setup/indexing step; and
- with a ready Library, to its Resume Point or first eligible Foto.

An explicitly addressed unknown, tombstoned, inaccessible, or filter-incompatible resource returns a real
404 instead of silently redirecting to another Foto. The 404 page links back to the current Library and
Resume Point.

The production API/auth/docs boundaries remain those in ADR-0023. The old `/curate`, `/prototypes/**`,
`/api/rpc/**`, prototype suggestion routes, local-drive route, and review `createServerFn` do not exist in
the final route tree.

## Deliberate deletion and rebuild

File System Access, the local `PhotoSource`, local folder crawler and registry, local review repository,
binary-string helpers, existing metadata parser/writer, mock review data, XState machines and write queue,
oRPC, TanStack AI, and their tests and dependencies are deleted. They are not hidden harnesses or fallback
write paths.

The existing OneDrive client, Effect runtime composition, D1 repositories, schemas, and server functions
are also implementation prototypes rather than migration inputs. New server interfaces and Layers are
written from the accepted Graph identity, auth, delta, command, outbox, retry, and observability contracts.
No existing metadata parser primitive or fixture is copied into the production JPEG module. The new codec
starts with independent segment parsing, bounded streaming, a full immutable metadata target, and the
ADR-0022 preservation corpus and invariants.

The repository history remains the reference for discarded experiments; production source does not keep
dead copies. `xstate`, `@xstate/react`, `@xstate/graph`, all `@orpc/*`, TanStack AI provider/client packages,
`zod`, `piexifjs`, and dependencies used only by deleted code are removed. The accepted production stack is
then exactly pinned as required by ADR-0023.

## Implementation sequence

Work happens on a branch with an Alchemy preview environment whose hostname, Access application, D1
database, Better Auth secret, Microsoft callback, Graph connection, Workflow bindings, and other secrets
are isolated from production. The definitive route and API paths are used from the first preview; no
shadow production route or production database is shared. A scaffold-only preview is allowed so routing,
Access, bindings, generated contracts, and deployment can be verified before real Foto data exists.

Each slice leaves the branch coherent and independently testable:

1. **Boundaries and empty shell.** Create `server`, `client`, and thin route entry points; establish exact
   pins, import rules, deterministic OpenAPI/client generation, build-id handling, isolated preview infra,
   sign-in/setup/review/404 shells, and deploy the first scaffold preview.
2. **Fresh identity and Library setup.** Implement Better Auth, Curator claim, delegated Graph token
   storage, root-folder selection, schema migrations, and the server-directed `/` flow with no reuse of
   old tables or services.
3. **Read-only Graph tracer.** Implement root delta staging and activation, the generated Foto/queue API,
   authenticated JPEG preview, the canonical resource route, responsive `Review.*` shell, navigation,
   filter, and Resume Point. This proves real OneDrive Personal pixels end to end before mutations.
4. **Durable human intent.** Add route-scoped TanStack Store, Concept autosave, stale-base handling,
   cross-device last-write-wins confirmation, skip/reopen, persisted Query allowlist, focus/reconnect
   refresh, and the app-closure safeguards.
5. **Automatic Suggestions.** Add generation-window planning, D1 Generation Commands and leases, Gemini
   minimization/limits/circuit behavior, Query polling, and editable Suggestion-to-Concept handoff.
6. **Verified approval.** Build the independent streaming JPEG codec and corpus first, then add full-target
   Approval Commands, transactional outbox, deterministic Workflow dispatch, conditional upload,
   verification, rollback, command polling, and immediate navigation after durable acceptance. No other
   write path exists.
7. **Recovery and operations.** Exercise every ADR-0025 state and copy path, repair verification,
   reauthentication, cursor rebuild, D1 cached read-only mode, Sentry redaction/alerts, cron reconciliation,
   OpenAPI docs, accessibility, and browser/platform behavior.
8. **Destructive cutover.** Remove every old route, module, test, generated artifact and dependency; prove
   there is no Effect browser bundle, oRPC, XState, FSA, old codec, or competing domain/write model; run the
   proportional ADR-0027 release gates and signoff; reset the single production D1 schema; deploy Worker
   and assets; then claim, reconnect, select the root folder, and rebuild the projection from Graph.

A slice may use fixtures or test doubles only behind the new server interfaces. It may not adapt the old
local model, expose both transports, split the immutable metadata target, simulate successful writes in a
production route, or make a client store authoritative.

## Cutover and rollback

The cutover is a destructive baseline migration of the existing production D1 database. It drops all
application and Better Auth tables and applies the new schema, so Curator claim, Microsoft session/token,
Library selection, projection, review state, and prototype records all start empty. The Curator explicitly
signs in, claims, reconnects, and selects the Library again. The Graph projection is rebuilt rather than
migrated from local paths or old item records.

Because the app is not yet live and nobody uses the current data, there is no maintenance window, active-
command drain, compatibility period, or data-mapping migration. Deployment is nevertheless ordered and
scripted: validate the exact preview artifact, apply the baseline migration, deploy the matching Worker and
hashed assets, run authenticated setup/API/browser smoke checks, and only then declare the build current.
Failure is roll-forward-only; an old Worker is never restored against the new schema, and D1 Time Travel is
not part of the product rollback promise.

## Consequences for existing decisions

- ADR-0015 is superseded. Router and Query retain their established ownership, but TanStack Store replaces
  XState and there is no browser write-queue actor.
- ADR-0016's responsive Splitscreen contract is confirmed; ADR-0028 supersedes its Kumo choice. Only the
  prototype implementation is discarded and ported into production `Review.*` components.
- ADR-0023's atomic oRPC/`createServerFn` cutover and Effect-free browser boundary are confirmed and made
  concrete.
- ADR-0019, ADR-0022, ADR-0024, and ADR-0025 define the new Graph projection, full-target JPEG write,
  server-authoritative state, and recovery behavior; prototype `MetadataEdit`, split `WriteKind`, local
  review, and simulated queue types have no migration role.

## Status

**Accepted (2026-09-12).** This is the implementation and destructive cutover path from the existing web
experiments to the integrated Curation webapp.
