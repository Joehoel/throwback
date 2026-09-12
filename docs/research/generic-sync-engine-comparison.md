# Generic sync-engine comparison for the Beheer-webapp

Status: **research complete; no production decision** · Date: 2026-09-11 · Issue:
[Onderzoek of een generieke sync-engine waarde toevoegt](https://github.com/Joehoel/throwback/issues/37)

> **Decision update (2026-09-12):** ADR-0024 selects the server-authoritative D1/HTTP candidate. The
> stricter ADR-0023 browser boundary also eliminates LiveStore under the current scope because no Effect
> runtime may ship in browser code.

## Executive finding

None of the evaluated generic sync engines replaces Throwback's difficult synchronization work:

1. ingesting a OneDrive hierarchy correctly through Microsoft Graph delta;
2. durably accepting an immutable approval command;
3. conditionally replacing and then verifying canonical JPEG metadata through Graph; and
4. reconciling the resulting Graph and D1 states after interruption.

Those are server-authoritative integration and saga concerns, not client-replication concerns. A sync
engine starts adding distinct value only if the product requires a local replica that supports durable
offline writes or near-instant cross-device updates. Offline curation is explicitly outside the Wayfinder
scope, and near-instant cross-device push is not a stated requirement. “The Curator can continue on another
device” requires shared durable server state, but does not by itself require local-first replication.

The serious shortlist for the current architecture therefore contains one candidate:

1. **Small server-authoritative D1/HTTP** — the only unconditional fit with the accepted architecture;
   online-only, with TanStack Query as frontend server-state cache and D1 plus Workflows as durable
   authority.

**LiveStore is a future watchlist option, not a current candidate.** It only becomes worth a narrowly scoped
spike if a later product decision brings durable offline Concept editing into scope. It must never own
approval-command acceptance or Graph conflict resolution, and it is disqualified even then if “no Effect in
the frontend” prohibits an Effect dependency/runtime in the browser.

This is an evidence-based narrowing step, **not a production choice**. LiveStore, Jazz, Yjs, Automerge,
Zero, and Convex fail one or more hard fit criteria below under the current requirements.

## Fixed project constraints

The comparison treats the current domain language and accepted ADRs as constraints, including the later
notes that supersede parts of earlier ADRs:

- A **Foto** is identified by OneDrive DriveItem identity, not path or content hash. Embedded JPEG
  metadata is canonical for Beschrijving, Locatie, and Oriëntatie; OneDrive is its transport and durable
  file store ([ADR-0019](../adr/0019-bestandsmetadata-als-bron-van-waarheid.md),
  [ADR-0022](../adr/0022-verified-conditional-jpeg-metadata-transaction.md)).
- The D1 Foto index is a **rebuildable projection**, but D1 as a whole is not rebuildable. Immutable
  commands, command status, Concepts/drafts, resume state, Curator ownership, Better Auth sessions, and
  encrypted delegated Microsoft tokens are durable application/security state
  ([ADR-0009](../adr/0009-eigen-d1-foto-index-voor-beheer-webapp.md),
  [ADR-0021](../adr/0021-authentication-and-access-boundaries.md)).
- Approval is one immutable full-target command. Completion requires a verified conditional JPEG
  replacement with explicit cTag/eTag and projection-revision preconditions. A merge engine's convergence
  or a successful client sync is not approval completion ([ADR-0022](../adr/0022-verified-conditional-jpeg-metadata-transaction.md)).
- One per-Foto Cloudflare Workflow executes that saga after the browser may have closed. Steps may retry,
  so external effects remain idempotent and conflicts are not automatically retried
  ([ADR-0011](../adr/0011-onedrive-writes-via-per-foto-workflows.md), Cloudflare's
  [rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)).
- The production app remains TanStack Start/React on Cloudflare Workers, provisioned through Alchemy, with
  Better Auth and Graph credentials available only to server code. The comparison assumes the requested
  constraint that frontend React code is not Effect-based
  ([ADR-0010](../adr/0010-infra-via-alchemy-op-cloudflare-workers.md),
  [Alchemy D1 migrations](https://alchemy.run/providers/cloudflare/d1/database/),
  [Alchemy Workflow resource](https://alchemy.run/providers/cloudflare/workflow/)).
- There is one Curator identity, but that Curator may use several devices. Stable Microsoft provider
  identity—not email—is the authorization anchor ([ADR-0021](../adr/0021-authentication-and-access-boundaries.md)).

## Four different synchronization problems

Calling all four “sync” hides the architectural boundary that matters most.

| Layer                                      | Authority and required behavior                                                                                                                             | Appropriate mechanism                                                                                               | What a generic client sync engine adds                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1. OneDrive ingest/delta**               | OneDrive DriveItems and canonical file bytes; enumerate changes, deletions, moves, and versions into a rebuildable Foto projection                          | Microsoft Graph delta reader plus D1 projection updater                                                             | Nothing directly. Every engine still needs a custom Graph importer and identity/subtree mapper.                                         |
| **2. Durable server commands**             | D1 command/Concept/status/auth tables; accept intent once, enforce projection and Graph preconditions, run/reconcile the JPEG saga after the browser closes | Authenticated HTTP command endpoint, D1 transaction/outbox, deterministic Workflow instance id, Cloudflare Workflow | A client sync acknowledgement is not durable external-side-effect completion. Any engine still needs this server command boundary.      |
| **3. Frontend server-state caching**       | D1/HTTP remains authoritative; avoid duplicate fetches, show optimistic UI, invalidate/refetch or poll status                                               | TanStack Query                                                                                                      | Already covered. TanStack describes Query as a cache/synchronization layer for asynchronous **server state**, not as another authority. |
| **4. Realtime/offline client replication** | Optional local durable copy, offline writes, automatic merge, subscriptions across devices                                                                  | LiveStore/Jazz/Yjs/Automerge/Zero, or Convex realtime for online clients                                            | This is the actual incremental capability under evaluation. It is only justified by an explicit product requirement.                    |

TanStack Query can optionally persist query and mutation caches, but that remains a cache and requires an
explicit default mutation function to resume a persisted mutation after reload. It must not become the
sole durable record of accepted approval intent
([TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview),
[persisted mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persisting-offline-mutations)).

### Independent Graph finding

Microsoft states that a client maintaining a full local representation of a folder or drive **must use
delta for the initial enumeration**; paging `children` is not guaranteed to see every item while concurrent
writes occur. Delta pages must be followed until a `deltaLink` is returned, a `410 Gone` requires a fresh
enumeration, items must be tracked by id, and the feed may contain the same item more than once
([driveItem delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0)).
That tightens ADR-0009's original “children crawl” wording independently of the sync-engine decision.

The current Graph v1.0 reference shows root-based request forms while describing changes to a DriveItem
and its children. Before implementation, verify against OneDrive Personal whether the selected Hoofdmap
can use a supported item-scoped delta URL or whether Throwback must consume drive-root delta and maintain
an id-based selected-subtree projection. A generic sync engine does not remove this uncertainty.

## Hard fit and elimination criteria

An option is eliminated from the current production shortlist if adopting it necessarily does any of the
following:

1. **Creates a competing authority.** Canonical Foto metadata remains in the JPEG/OneDrive. A local
   CRDT/LWW result may never independently mark a Foto handled.
2. **Weakens command semantics.** Approval acceptance is a server-authenticated CAS operation against the
   expected projection revision and Graph tags. Concurrent commands conflict for human re-evaluation;
   they are not silently merged, rebased, or last-writer-wins.
3. **Makes accepted intent browser-dependent.** After acknowledgement, the immutable command and its
   status must survive tab/device loss before Graph work starts.
4. **Exposes delegated Graph credentials.** Better Auth session cookies and Microsoft access/refresh
   tokens stay server-only. A browser-readable JWT used solely to authenticate a sync connection must not
   contain or grant Graph credentials.
5. **Requires replacing accepted infrastructure without a demonstrated requirement.** D1 remains the
   rebuildable Foto projection and durable command/status/auth store; Cloudflare Workflows remains the
   saga runner; Workers/Alchemy remains the deployment plane.
6. **Adds a separately operated stateful service merely for caching.** A Postgres logical-replication
   service, long-running filesystem sync server, or second hosted database is disproportionate for one
   Curator unless offline/realtime is proven necessary.
7. **Violates the frontend constraint.** No application-level Effect services/programs in React. If the
   intended rule is stricter—no Effect runtime/dependency in the browser at all—LiveStore is also a hard
   elimination.

Offline capability is deliberately **not** an automatic positive. Offline creation of an approval command
is semantically risky: it cannot validate current eTag/cTag, current canonical bytes, revocation, or subtree
membership. At most, an offline client may preserve a Concept. On reconnect, the server must re-read the
Foto and explicitly accept or reject conversion of that Concept into a command.

## Comparison matrix

| Option                               | Online/local-first behavior                                                                                                                  | Server authority, CAS, and D1 fit                                                                                                                                                                                                                               | Runtime and operational components                                                                                                                                                                | Current outcome                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **D1/HTTP**                          | Online-only writes; cached reads and optimistic UI; multi-device through shared D1                                                           | Native fit. D1 owns durable state; explicit SQL revision CAS and immutable command; Graph CAS remains in Workflow                                                                                                                                               | Existing Worker + D1 + Workflows + Better Auth + Access, all in Alchemy                                                                                                                           | **Shortlist #1; unconditional baseline**                                                               |
| **LiveStore 0.4**                    | Local-first; browser OPFS/SQLite; offline event queue; realtime via central ordered event log                                                | Its event log, not an existing remote DB, is the model's source of truth. Global online transactions and authorization are application concerns; documented merge-conflict handling is not implemented. Can only be an auxiliary layer, never command authority | Browser dedicated + shared workers, in-memory SQLite, OPFS; Cloudflare Worker + Durable Object per store; DO SQLite by default or D1 for event persistence                                        | **Eliminate under current online-only scope; watchlist only if offline Concepts enter scope**          |
| **Jazz Tools current `@alpha` line** | Local-first relational query subscriptions, OPFS worker client, queued offline writes, edge/global reconciliation                            | Own row-version database and per-column LWW. Server policies exist, but approval still needs a separate CAS command endpoint. Does not reuse D1 as its database                                                                                                 | Jazz Cloud, or self-hosted long-running Jazz server with filesystem persistence; browser worker/Wasm; Workers can host a Jazz runtime/client but official core server setup is a separate process | **Eliminate: second database/service and wrong default conflict semantics**                            |
| **Yjs**                              | CRDT documents; offline only when combined with `y-indexeddb`; realtime via a selected provider                                              | No application database, command processor, relational schema, auth policy, or Graph CAS. Yjs updates converge regardless of order, which is not the approval conflict policy                                                                                   | IndexedDB plus `y-websocket`/custom provider; official persistence choices include LevelDB/Redis ecosystem packages; Workers/DO integration would be custom                                       | **Eliminate: toolkit would make us build the missing server product**                                  |
| **Automerge**                        | Local-first JSON-like CRDT documents; IndexedDB and WebSocket adapters; offline writes                                                       | Automatic document merge is not explicit command CAS. Production auth/authorization and server policy are left to the application; D1 adapter is not supplied                                                                                                   | Browser Wasm/IndexedDB plus a production self-hosted sync server and storage/network adapters; official server example is Node WebSocket + filesystem                                             | **Eliminate: custom secure sync service and difficult schema evolution for no demonstrated CRDT need** |
| **Zero**                             | Realtime local query cache and optimistic writes while connected/briefly connecting; explicitly rejects writes after it becomes disconnected | Authoritative upstream must be Postgres; mutate endpoint writes to Postgres and logical replication feeds Zero. D1 is not a supported authoritative upstream                                                                                                    | Postgres + `zero-cache` container + query/mutate API + public WebSocket endpoint; multi-node adds replication manager, view syncers, private networking, and replica backup                       | **Hard eliminate: replaces D1 and adds Postgres/container operations without offline writes**          |
| **Convex**                           | Server-authoritative realtime subscriptions and optimistic UI; mutations queue in memory and reconnect, not a durable offline local database | Strong serializable server mutations/OCC, but in the Convex database. Adopting it duplicates or replaces D1. External actions and Convex workflow state do not integrate transactionally with D1/Cloudflare Workflows                                           | Separate hosted Convex deployment, or self-hosted Convex backend; Cloudflare Worker becomes a client. Better Auth needs a JWT/OIDC bridge                                                         | **Hard eliminate: second backend/deployment plane and duplicate workflow stack**                       |

## Candidate 1 — small server-authoritative D1/HTTP

### Why it remains serious

It matches the actual consistency boundary. One authenticated HTTP endpoint can accept an idempotent
command only when all of these are still true:

- the Better Auth session resolves to the claimed stable Microsoft provider identity;
- the DriveItem is proven to be inside the selected Hoofdmap;
- the client-supplied projection revision equals the current D1 revision; and
- the expected DriveId, DriveItemId, cTag, and eTag equal the projected base.

The acceptance transaction stores the immutable full target and advances durable status. A conditional
`UPDATE ... WHERE revision = ?` (or equivalent insert constraint) makes a stale second device return a
typed conflict rather than overwrite the first. D1 `batch()` is transactional: a failed statement rolls
back the batch
([D1 Workers API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)).

Workflow creation cannot be atomically committed with a D1 transaction. Therefore the robust shape is an
outbox/dispatcher protocol: commit the command and a dispatch-needed state in D1, derive a deterministic
Workflow instance id from the command id, attempt creation, and let retries or a reconciler safely repeat
dispatch. Workflow steps then enforce the stronger Graph protocol from ADR-0022. Cloudflare explicitly
requires idempotent step effects because steps may retry; `status()` exposes queued/running/waiting/error/
complete states
([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/),
[trigger and inspect](https://developers.cloudflare.com/workflows/build/trigger-workflows/)).

On the frontend:

- TanStack Query reads D1-backed endpoints, caches them, and invalidates or polls after mutations.
- Optimistic presentation is allowed, but “handled” only comes from verified server status.
- A Concept autosaves to D1 with last-D1-write-wins semantics between devices while its Foto base remains
  current. The Concept carries that base's projection revision and Graph tags; when the Foto base is stale,
  the server returns `409 Conflict` plus current state and requires explicit rebase rather than silently
  merging semantically complete metadata targets.
- Resume state is a simple server write, not a lock. A later write from another device may intentionally be
  last-write-wins because it is navigation state, not approved metadata; that policy should be explicit.

### Data separation and migrations

Do not call the entire D1 database rebuildable. Keep lifecycle boundaries explicit even if tables share a
binding:

- **rebuildable:** Foto/folder projection and Graph delta cursor/generation;
- **durable product intent:** Concepts, approval commands, command attempts/status, skips, and resume state;
- **durable security:** Curator ownership, Better Auth users/accounts/sessions, encrypted OAuth tokens; and
- **dispatch/reconciliation:** outbox rows and Workflow correlation ids.

D1 supports ordered SQL migrations and records applied versions; Alchemy can apply the migration directory
during deployment. Destructive projection rebuilds must target only projection tables/generations and must
never clear command or auth tables. D1 Time Travel offers point-in-time recovery (7 days on Free, 30 days on
Paid according to the current docs), but is not a substitute for migration discipline or longer-term backup
of security/command state
([D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).

### Auth and token custody

Better Auth can encrypt OAuth tokens at rest with `account.encryptOAuthTokens`; the documented default is
`false`, so the production configuration must explicitly keep it enabled. Its server API refreshes expired
provider access tokens and permits a trusted server call to select by `userId`. Browser code needs only the
HttpOnly application session and never receives a delegated Graph token
([Better Auth options](https://better-auth.com/docs/reference/options#account),
[Better Auth OAuth](https://better-auth.com/docs/concepts/oauth#get-access-token)).

The current Better Auth documentation requires an explicit account selector (`accountId`, account cookie,
or trusted-server `userId`) and says `providerId` alone is not a selector. ADR-0011's older verified call
shape used `providerId + userId`; re-verify the exact API against the installed Better Auth version during
implementation rather than copying that call literally.

### Portability and operations

This option has Cloudflare lock-in at the D1 binding and Workflow implementation, but its domain boundary is
ordinary SQL plus authenticated HTTP and an explicit saga. Projection and command rows are exportable, and
the command/CAS protocol can be ported to another SQL database and durable executor. The operational set is
also the already accepted one: one Worker deployment, D1, Workflow binding, Better Auth, Cloudflare Access,
Alchemy state, migrations, and Sentry.

Its principal drawback is deliberate: no durable offline writes and no push realtime. For one Curator,
cross-device freshness can start with mutation invalidation, focus/reconnect refetch, and bounded polling of
active command status. SSE or a Durable Object notification channel should be added only after measured UX
need; neither changes command authority.

## Conditional watchlist — LiveStore, only behind a future offline requirement

### What it genuinely adds

LiveStore is local-first event sourcing: synced events are ordered by a central backend and materialized to
local SQLite; the web adapter persists through OPFS and works offline automatically. Its first-party
Cloudflare provider routes through a Worker to a Durable Object scoped by `storeId`, with DO SQLite as the
default event store and D1 as an option
([introduction](https://docs.livestore.dev/overview/introduction/),
[syncing](https://docs.livestore.dev/building-with-livestore/syncing/),
[Cloudflare provider](https://docs.livestore.dev/sync-providers/cloudflare/)).

That is a real layer-(4) capability: a Concept can be edited with no connection and later appear on another
device. LiveStore also has a first-party Cloudflare topology, unlike Yjs/Automerge, and is self-hostable.

### Why it cannot own the current write model

LiveStore's own fit guide says it is not a good fit when an existing remote database is the source of truth
or when the application wants a traditional remote-server authority. Its local event log is the source from
which state is derived. The docs also say global “online transactions” must be modeled by application logic,
and the sync docs currently state that merge-conflict handling is not implemented
([when to use LiveStore](https://docs.livestore.dev/overview/when-livestore/),
[FAQ](https://docs.livestore.dev/misc/faq/),
[syncing](https://docs.livestore.dev/building-with-livestore/syncing/#merge-conflicts)).

Therefore LiveStore events cannot mean “Foto approved” or “Foto handled.” At most they represent a local
Concept/edit intention. Reconnection must send that intention through the same authenticated server CAS
endpoint as candidate 1. This produces an unavoidable bridge between LiveStore state and authoritative D1
command state. A spike must prove that the offline UX is worth this extra model and that rejected/stale
Concepts remain intelligible after rebase.

### Frontend, auth, migrations, and maturity risks

- LiveStore's browser adapter currently requires a dedicated worker and shared worker, uses an additional
  in-memory SQLite database, and supports only OPFS for persistent web storage. It falls back to memory when
  OPFS is unavailable in Safari/Firefox private browsing
  ([web adapter](https://docs.livestore.dev/platform-adapters/web-adapter/)).
- LiveStore has no built-in auth. The Cloudflare adapter can validate a cookie/header at connection time and
  requires per-push validation as well. This can call Better Auth, but it is additional security plumbing;
  Graph credentials still remain exclusively in the D1-backed server/Workflow
  ([LiveStore auth pattern](https://docs.livestore.dev/patterns/auth/)).
- State tables migrate automatically from event materializers, but event definitions cannot be removed and
  event-schema evolution must remain forward-compatible for old clients. Unknown newer events require an
  explicit policy. That is a different migration discipline in addition to D1 migrations
  ([events and schema evolution](https://docs.livestore.dev/building-with-livestore/events/),
  [SQLite state schema](https://docs.livestore.dev/building-with-livestore/state/sqlite-schema/)).
- LiveStore 0.4 is explicitly beta and warns that API, client storage format, and sync-backend storage format
  may still break. Its docs say it is not yet ready for all production scenarios
  ([state of the project](https://docs.livestore.dev/misc/state-of-the-project/)).
- LiveStore itself is built on Effect and uses Effect Schema. Its React integration offers Promise/React
  APIs, so React components need not be authored as Effect programs, but Effect remains part of the browser
  data layer and schema surface
  ([Effect integration](https://docs.livestore.dev/patterns/effect/),
  [React integration](https://docs.livestore.dev/framework-integrations/react-integration/)).

This last point creates a binary gate for a spike: if “no Effect frontend” means no frontend Effect
dependency/runtime, stop. If it means React/domain UI code must use ordinary React/Promise APIs while a
library may use Effect internally, the spike remains possible.

### Minimum spike acceptance criteria

Do not run this spike unless a later scoped decision first supersedes the current online-only boundary and
declares offline Concept editing a product requirement. Then require all of the following before considering
LiveStore further:

1. two browsers edit the same Foto Concept offline and reconnect without silently creating an approval;
2. server CAS rejects a stale approval and leaves both Concept histories recoverable;
3. Better Auth's HttpOnly session is revalidated on every pushed event; no Graph token reaches LiveStore or
   browser storage;
4. deleting/rebuilding the Foto projection does not lose Concepts, commands, status, or auth state;
5. a schema upgrade works with one old offline client and one new client;
6. Alchemy provisions the additional Worker/DO bindings and migrations without a parallel wrangler source of
   truth; and
7. measured bundle/startup/storage cost is acceptable across current iPhone Safari, macOS Safari/Chrome,
   and Windows Edge/Chrome.

## Eliminated options

### Jazz Tools

The current Jazz architecture is a local-first relational database with OPFS in a browser worker, local
writes, query subscriptions, and upstream edge/global reconciliation. It supports external JWT auth,
server-enforced row policies, cookie-based WebSocket auth, and Better Auth through a JWT/JWKS bridge
([how sync works](https://jazz.tools/docs/concepts/how-sync-works),
[authentication](https://jazz.tools/docs/auth/authentication),
[permissions](https://jazz.tools/docs/auth/permissions)). These are stronger full-stack facilities than
Yjs or Automerge.

They do not fit the fixed storage topology. Hosted use adds Jazz Cloud as a second durable authority;
self-hosting uses the current `jazz-tools@alpha server` with a persistent filesystem data directory. The
official Cloudflare example demonstrates booting a Jazz **runtime** in workerd with a precompiled Wasm
module, not replacing the core persistent sync server with D1/Workflows
([server setup](https://jazz.tools/docs/getting-started/server-setup),
[examples](https://jazz.tools/docs/reference/examples)). Better Auth would still retain delegated Graph
tokens outside Jazz, so auth becomes split rather than simpler.

Most importantly, concurrent writes to the same field resolve per-column by wall-clock last-writer-wins.
Jazz retains row history, but the visible value converges automatically
([internals](https://jazz.tools/docs/reference/internals#merge-strategies),
[local-first data model](https://jazz.tools/docs/concepts/local-first-data-model)). That is useful for
collaboration but is not the required explicit stale-approval conflict. Keeping approval behind a separate
HTTP CAS endpoint restores correctness but also restores the D1/HTTP architecture while leaving a second
database and sync server.

Jazz's hash-addressed bidirectional migration “lenses” are sophisticated and allow old/new clients to
interoperate, but add a separate schema catalogue and deploy command to D1/Alchemy migrations
([Jazz migrations](https://jazz.tools/docs/schemas/migrations)). For this one-Curator app the benefit does
not outweigh that operational and conceptual duplication.

### Yjs

Yjs is a CRDT library for shared types, not a server-authoritative application database. Its binary updates
are commutative, associative, and idempotent. Offline durability comes from a separate `y-indexeddb`
provider; networking comes from providers such as `y-websocket`; server persistence and scaling are separate
provider choices
([document updates](https://docs.yjs.dev/api/document-updates),
[offline support](https://docs.yjs.dev/getting-started/allowing-offline-editing),
[y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)).

That is excellent for concurrent rich text, but Throwback's full-target approval command must detect a stale
base rather than merge concurrent targets. Yjs supplies neither domain schemas/migrations, server policies,
D1 projection integration, durable command execution, nor a Cloudflare Workflow bridge. Implementing a
secure Durable Object provider, persistence, authorization, indexing, compaction, migrations, and the D1
command bridge would amount to building a custom sync product to preserve an architecture that already
works without it. It fails criteria 2, 3, and 6.

### Automerge

Automerge similarly provides JSON-like CRDT documents and a transport-agnostic sync protocol. Automerge
Repo supplies pluggable storage/network interfaces, with built-in browser IndexedDB and Node filesystem/
WebSocket examples. Its public sync server is explicitly experimental; the project tells production users
to run their own
([concepts](https://automerge.org/docs/reference/concepts/),
[repositories](https://automerge.org/docs/reference/repositories/),
[network sync](https://automerge.org/docs/tutorial/network-sync/)). The official tutorial also warns that
privacy initially rests on not disclosing a document id until application security is implemented
([multiple task lists](https://automerge.org/docs/tutorial/multiple-task-lists/)).

There is no first-party D1/Cloudflare persistence and authorization stack. More fundamentally, automatic CRDT
merge is not the Graph/D1 CAS policy. Schema evolution is also explicitly application-owned and harder than
centralized migrations because multiple clients can independently run a migration; the docs describe
hard-coded deterministic migration changes and note that richer migration work is not implemented
([modeling data/versioning](https://automerge.org/docs/cookbook/modeling-data/#versioning)). Automerge has
low provider lock-in, but very high custom operational/application burden for no current collaborative-data
need.

### Zero

Zero is query-driven realtime sync over an authoritative Postgres database. The server mutate endpoint
writes directly to Postgres, `zero-cache` consumes logical replication into a SQLite replica, and clients
receive changed query rows. It cannot use D1 as the accepted source database
([installation](https://zero.rocicorp.dev/docs/install),
[mutators](https://zero.rocicorp.dev/docs/mutators)).

Self-hosting requires Postgres, one or more `zero-cache` processes, persistent replica storage, API
endpoints, and public WebSocket routing. Multi-node operation separates a replication manager and view
syncers and requires backup/private networking
([self-hosting](https://zero.rocicorp.dev/docs/self-host)). Schema changes require coordinated expand/
contract ordering across Postgres, replication, API, and client
([schema changes](https://zero.rocicorp.dev/docs/schema#schema-changes)).

Despite that cost, current Zero explicitly does **not** support offline writes: disconnected/error/auth-needed
states keep synced reads but reject writes. Its queued `connecting` state is intended only to cover short
glitches
([connection states](https://zero.rocicorp.dev/docs/connection)). Zero therefore replaces D1 and adds the
largest operational subsystem without satisfying the only capability that could justify such a replacement.

### Convex

Convex provides a strong server-authoritative database, reactive WebSocket queries, serializable
transactions, and optimistic concurrency control with deterministic retries
([overview](https://docs.convex.dev/understanding/overview),
[OCC and atomicity](https://docs.convex.dev/database/advanced/occ),
[React client](https://docs.convex.dev/client/react/overview)). It is closer to a complete alternative
backend than to a D1 sync adapter.

That is the mismatch: the Convex database and deployment become an additional or replacement authority.
The client queues mutations **in memory**, reconnects automatically, and warns before closing a tab with
outstanding mutations; it is realtime online behavior, not durable offline command capture. Convex actions
that call external APIs are not automatically retried; its Workflow component can add durable retries, but
that duplicates accepted Cloudflare Workflows rather than integrating their D1 state
([scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions),
[actions](https://docs.convex.dev/functions/actions)).

Convex can validate external OIDC/JWT providers, so Better Auth could issue a browser token for Convex, but
the delegated Microsoft Graph token must still live server-side in Better Auth/D1. This splits identity and
state across deployments
([custom auth](https://docs.convex.dev/auth/advanced/custom-auth)). Hosted Convex has significant API/data
model lock-in. Its resumable migration component can evolve Convex documents online, but is another schema
and deployment lifecycle alongside D1/Alchemy
([Convex migrations](https://docs.convex.dev/database/writing-data#migrations)). Self-hosting and exports
exist, but self-hosting runs the separate Convex backend and its current server license is FSL Apache 2.0
with a two-year conversion, not an Alchemy-managed Workers/D1 resource
([self-hosting and license](https://docs.convex.dev/self-hosting),
[data export](https://docs.convex.dev/database/import-export/export)).

## Remaining uncertainties before a decision

1. **Graph scope:** verify the supported OneDrive Personal delta shape for the selected Hoofdmap and the
   initial rebuild algorithm. Official docs require delta rather than a concurrent `children` crawl but show
   root request forms.
2. **Better Auth API/version:** verify trusted sessionless token retrieval and OAuth-token encryption against
   the exact production version. The current official selector contract has evolved since ADR-0011's spike.
3. **Dispatch recovery:** define how an accepted D1 command whose Workflow creation response is lost is
   redispatched, correlated, and surfaced. A deterministic id plus outbox/reconciler is the likely protocol,
   but it still needs a focused decision/test.
4. **D1 migration/rebuild boundaries:** settle table ownership, backup policy, and a projection-generation
   swap so a Foto rebuild can never remove owner/auth/Concept/command/outbox state.

Two scope changes would require reopening this research rather than silently expanding the baseline:

- durable offline Concept editing becomes a product requirement; and
- “no Effect frontend” is clarified broadly enough to permit LiveStore's browser runtime.

Under the current online-only scope, the evidence supports validating the small D1/HTTP protocol rather than
introducing a generic sync engine. That is a research conclusion about fit and next evidence—not a production
architecture decision.
