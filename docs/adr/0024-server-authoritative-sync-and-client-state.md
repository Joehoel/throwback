# Server-authoritative synchronization and client state

The online-only Curation webapp uses Microsoft Graph delta plus D1 for shared state, TanStack Query for
browser caching, and Cloudflare Workflows or leased dispatchers for durable work. It does not add a generic
sync engine, realtime transport, browser mutation queue, or competing authority. This preserves explicit
Graph concurrency and command semantics while allowing one Curator to continue across devices.

## Authorities and state ownership

The word “sync” covers separate mechanisms with separate owners:

- OneDrive and embedded JPEG metadata remain authoritative for Foto content. A Graph delta ingester builds
  the rebuildable D1 Foto projection.
- D1 is authoritative for Concepts, the Resume Point, Generation Commands, Approval Commands, their
  statuses, dispatch state, and authentication data. These durable tables are never part of a projection
  rebuild.
- TanStack Query caches server read models. XState owns review-screen modes and orchestration. The browser
  input buffer owns only keystrokes not yet confirmed by Concept autosave.
- Cloudflare Workflow executes the verified JPEG transaction after D1 accepts an Approval Command. A
  leased Worker dispatcher executes bounded Gemini Generation Commands.

LiveStore, Jazz, Yjs, Automerge, Zero, and Convex remain excluded. Offline curation is out of scope, a
generic replica cannot replace Graph ingest or command reconciliation, and ADR-0023 forbids the Effect
runtime that LiveStore would add to shipped browser code.

## Graph ingest and selected subtree

Production uses the documented OneDrive Personal request form
`GET /drives/{drive-id}/root/delta`. The narrower root-folder boundary remains an application invariant,
not a Graph delta scope. D1 stores a minimal skeleton for the whole drive—item id, parent id, node kind,
and tombstone state—and stores names, tags, projected Foto metadata, and review-facing details only for
the selected subtree.

The ingester follows Graph-provided `@odata.nextLink` and `@odata.deltaLink` URLs as opaque values. It
never manufactures a token. It consumes every page, resolves duplicate items by their last occurrence in
the complete traversal, and tracks identity and ancestry exclusively by DriveId plus DriveItemId. Folder
moves and deletions recompute descendant membership recursively. A subtree moving into scope is hydrated
by item id before its Foto details become active; a subtree moving out becomes hidden while durable review
history remains.

Every traversal has one library-scoped run and staging area. Initial linking and cursor recovery build a
new generation and atomically activate it only after receiving the final delta link. The first link shows
indexing progress and does not allow curation before activation. On `410 Gone` or an unusable cursor, the
last active generation remains visible read-only while the replacement builds.

Incremental runs likewise stage a complete page sequence before publishing changes. Applying each changed
Foto uses its projection revision as CAS. A Workflow completion that updated a Foto after the delta run
started wins; the ingester skips that staged row and immediately runs the newly stored delta link again.
Durable Concepts, commands, statuses, and Resume Point are joined to the active projection rather than
copied between generations.

Deleting or losing access to the selected root folder makes the Library read-only. History remains until
the same item identity is restored or the Curator performs the separate explicit Library reset from
ADR-0021; the app never widens itself to the drive root.

## Freshness and failure behavior

The initial enumeration runs durably. After that, an app open or manual synchronization requests a
singleton delta Workflow when the last successful run is more than five minutes old; manual refresh may
bypass the age check but not singleton deduplication. An hourly scheduled trigger is the recovery net for
missed demand-driven work. A successful internal JPEG write updates the active D1 projection immediately
and requests a follow-up delta.

A transient refresh failure with a still-usable cursor leaves curation available and shows a stale-state
warning. Approval remains safe because D1 performs projection CAS and the Workflow rechecks Graph tags and
bytes. A stale external change can therefore cause an explicit conflict, never a silent overwrite. Cursor
loss, root-folder loss, and a first enumeration without an active generation are the conditions that make
the projection read-only.

## TanStack Query and browser persistence

The SPA refetches stale data on focus and reconnect and invalidates the affected Foto, queue, Concept,
Resume Point, and command keys after a mutation. While visible, the current read model and queue refetch at
most every 30 seconds. Active Generation and Approval Commands poll after 2, then 5, then 10 seconds and
remain at the 10-second ceiling until terminal; all interval polling pauses while the document is hidden.
There is no SSE, WebSocket, or Durable Object notification channel.

IndexedDB may persist only an allowlist of D1-confirmed folder, queue, Foto read-model, and Resume Point
queries. It never persists JPEG or preview bytes, Concepts, Suggestions, command payloads, errors,
authentication data, OAuth material, or mutations. The cache is partitioned by Curator, Library, schema,
and SPA build id, has a maximum age of seven days, and always revalidates immediately after online restore.
It is cleared on sign-out, OneDrive disconnect, Library reset, owner mismatch, schema mismatch, or build
mismatch. Cached data may improve startup rendering but never enables offline curation or command
acceptance.

The unconfirmed input buffer, XState actors and modes, mutation state, dialogs, map viewport, and other
presentation state remain memory-only. Concept autosave and cross-device last-write-wins behavior remain
as decided in the review-continuity model; no browser cache changes those semantics.

## Durable dispatch and reconciliation

Approval acceptance is one D1 transaction. It verifies the session, Curator, subtree membership, Foto
base, projection revision, tags, and single-active-command invariant, then stores the immutable full target,
an `accepted` command, and a pending outbox row. The API returns `202 Accepted` after that commit; Workflow
creation is not part of the acknowledgement boundary.

After commit, the request performs a best-effort dispatch in `waitUntil`. The Workflow instance id is
derived deterministically from the Approval Command id. A scheduled dispatcher runs every minute, leases
pending or expired outbox rows, and safely repeats create/get/status reconciliation. A duplicate instance
id joins the existing instance instead of creating a second write. The browser never starts or queries a
Workflow directly.

D1 remains the application status authority. Workflow steps record meaningful transitions and terminal
results in D1. The reconciler inspects Cloudflare instance status only to repair a missed transition or a
dispatcher interruption; it never turns infrastructure completion into `handled` without ADR-0022's
verified JPEG and atomic D1 completion step.

Generation Commands use the same durable-server principle without one Workflow per Gemini call. A D1
lease dispatcher claims eligible queued commands, enforces the global maximum of two concurrent provider
calls and the cost reservation, and runs them in Worker `waitUntil`. Expired leases become claimable after
the recorded attempt; request-driven dispatch is the fast path and the scheduled dispatcher is recovery.
The browser only observes D1 Generation Command and Suggestion state.

## Consequences for existing decisions

- ADR-0009's own D1 projection remains, but its initial `children` crawl, manual-only refresh, and combined
  pending-write wording are superseded by root delta, staged generations, and separate durable commands.
- ADR-0011's per-Foto Workflow remains and gains an explicit transactional outbox and one-minute
  dispatcher-reconciliation boundary.
- ADR-0015's XState/TanStack Query split is confirmed; Query is cache, not durable business state.
- ADR-0019, ADR-0021, ADR-0022, and ADR-0023 remain authoritative for canonical metadata, auth and Library
  scope, verified writes, and the generated HTTP boundary.

## Status

**Accepted (2026-09-12).** This is the synchronization and client-state architecture for the integrated
Curation webapp.
