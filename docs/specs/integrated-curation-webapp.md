# Integrated Curation webapp specification

Status: **implementation-ready** · Date: 2026-09-12 · Map:
[Wayfinding: geïntegreerde cross-platform Beheer-webapp](https://github.com/Joehoel/throwback/issues/21)

## Outcome

Build one online, responsive **Curation webapp** for one **Curator** on current iPhone Safari, macOS
Safari/Chrome, and Windows Edge/Chrome. The Curator reviews JPEG **Fotos** from one selected OneDrive
**Library**, curates **Description**, **Location**, and **Orientation**, and may use editable Gemini
**Suggestions**. No Suggestion or browser-side change reaches a JPEG without explicit human approval.

The app is a clean Graph-only rebuild. File System Access, local-folder curation, non-JPEG writes, offline
curation, multiple Curators, and integration with the Fotoshow are outside this specification.

## Product contract

### Setup and identity

1. Cloudflare Access protects the entire production hostname.
2. Better Auth signs in a personal Microsoft account and owns the application session and delegated Graph
   tokens. Passing Access does not grant application identity.
3. An empty installation asks the signed-in person to claim the single Curator identity explicitly. D1
   stores `microsoft` plus the stable provider account id; email is display-only.
4. The Curator selects one OneDrive root folder as the Library boundary. The app requests delegated
   `Files.ReadWrite` and required identity/offline scopes, never `Files.ReadWrite.All`.
5. `/` routes by server-confirmed state to sign-in, claim/Graph/Library setup, indexing, or the Library's
   **Resume Point**. There is no browser-local authoritative setup state.

The auth and authorization contract is defined by
[Kies authenticatie en toegangsgrenzen](https://github.com/Joehoel/throwback/issues/27) and
`docs/adr/0021-authentication-and-access-boundaries.md`.

### Library projection and freshness

Production follows the documented `GET /drives/{drive-id}/root/delta` feed. D1 stores a minimal whole-drive
id/parent/type/tombstone skeleton and complete review-facing details only for descendants of the selected
root folder. Item identity is always DriveId plus DriveItemId; path, name, email, and content hash are not
identity.

Initial indexing and cursor recovery write a staging generation and activate it only after the final opaque
Graph delta link. Initial setup remains in indexing mode until activation. During cursor recovery, the last
active projection remains visible read-only. Folder moves and deletions recompute subtree membership by id;
durable review history is hidden rather than deleted when a Foto leaves scope.

App open or manual synchronization requests a singleton delta run when the projection is older than five
minutes; manual refresh may bypass the age check. An hourly trigger repairs missed runs. Own verified writes
update D1 immediately and request a follow-up delta. A transient sync failure warns but does not block
curation while the cursor remains usable; root-folder or cursor loss makes the projection read-only.

See [Kies de synchronisatie- en clientstate-architectuur](https://github.com/Joehoel/throwback/issues/38),
`docs/adr/0024-server-authoritative-sync-and-client-state.md`, and
`docs/research/graph-delta-scope.md`.

### Review workflow

The canonical bookmark is `/libraries/$libraryId/events/$eventId/photos/$photoId`. An explicitly addressed
unknown, tombstoned, inaccessible, or filter-incompatible resource returns 404 with links back to the
Library and Resume Point; it never silently substitutes another Foto.

At widths of at least 1024 px, the Foto occupies the flexible left workspace and a 24-rem editor sits on
the right, with filmstrip and actions below. Narrower screens use one vertical Foto-first stream. Mobile
product actions are at least 44 by 44 CSS pixels and the bottom action area respects the iPhone safe area.
The same actions and state meanings apply on every platform.

The route exposes navigation, stable review filters, Description, Location, Orientation controls, a
separate Suggestion presentation, Concept autosave state, command progress, and persistent conflict/error
status. Applying or editing a Suggestion is human intent and creates or changes a Concept; merely receiving
a Suggestion does not.

One D1 Concept per Foto stores the full desired Description, Location, and Orientation, its base projection
revision, and a server-monotone draft revision. Browser autosaves are short-debounced and serialized;
internal navigation waits for the final acknowledgement. Confirmed saves from multiple devices are
last-write-wins in D1. A changed Foto projection makes the Concept stale and blocks approval until explicit
re-evaluation.

**Approve and continue** first commits one immutable full-target **Approval Command** and outbox row in D1.
Only after `202 Accepted` does the UI navigate; the JPEG Workflow continues independently. **Skip** changes
review outcome without touching JPEG bytes. A verified no-op may complete without upload. Only a verified
target makes a Foto `handled`; technical activity is never a review outcome.

See [Bepaal reviewstatus en continuïteit tussen apparaten](https://github.com/Joehoel/throwback/issues/22),
[Valideer de responsive reviewworkflow](https://github.com/Joehoel/throwback/issues/31), and
`docs/adr/0016-ui-met-cloudflare-kumo-splitscreen-richting.md`.

### Automatic Suggestions

Paid Gemini Developer API calls are stateless and use `store=false`. The server sends an inline,
metadata-free, correctly oriented JPEG derivative with a maximum dimension of 1024 px plus only allowed
year/month/Event context. Originals, EXIF/XMP, filenames, paths, coordinates, existing Description, people
names, Concept text, and previous outputs are excluded. Provider abuse-monitoring retention of up to 55
days is disclosed and accepted; no provider data may be used for model improvement.

The generation window contains the current Foto plus the next two eligible Fotos. D1 deduplicates work
across devices. A leased dispatcher permits at most two concurrent provider calls. Each Generation Command
has at most three attempts, a maximum of 500 new generations per UTC day, and a hard configurable monthly
budget defaulting to US$10. Reservations prevent worst-case overspend. AI can be disabled per Library;
manual curation always remains available.

Description Suggestions are requested for every eligible Foto. A Location hint is requested only when no
effective Location exists. Gemini never decides Orientation. Suggestion output is validated and remains
separate from the Concept until explicitly applied or edited.

See [Kies de lifecycle van automatische Gemini-suggesties](https://github.com/Joehoel/throwback/issues/29)
and `docs/research/generic-sync-engine-comparison.md` for the rejected client-replication alternatives.

### Verified JPEG transaction

Embedded JPEG metadata is canonical. An Approval Command contains one complete immutable target:

- Description is text or absent. Text is canonical XMP `dc:description`, mirrored to XMP `dc:title`, EXIF
  `XPTitle`, and EXIF `XPSubject`; absence removes all managed Description fields.
- Location is latitude/longitude or absent. Setting, replacing, or clearing coordinates removes altitude;
  an untouched Location preserves existing altitude. Other unmanaged GPS fields remain.
- Orientation is semantic EXIF value 1 through 8, with a missing tag interpreted as 1. Quarter-turn actions
  compose correctly with mirrored orientations; pixels are not rotated.

A server-only bounded streaming codec may alter only the managed metadata. Entropy-coded scan bytes, ICC,
unknown APP/COM segments, EXIF thumbnail and Interop data, MakerNote/unknown tags, unrelated EXIF/GPS/XMP,
and container ordering required for validity are preserved. Unsupported or unprovable structures fail
before upload.

The per-Foto Workflow checks projected revision, eTag/cTag, current bytes, identity, and subtree membership;
creates a conditional Graph upload session; streams sequential 320-KiB-aligned fragments where split;
reconciles interruptions; redownloads and verifies the complete target and preservation invariants; then
atomically completes D1. A `412` or invalidated session is a conflict. An uncertain commit is read back.
Incorrect committed bytes are rolled back only conditionally to the verified previous OneDrive version and
then reverified. No rollback may overwrite a later external write.

See [Bepaal de betrouwbare JPEG-metadata-transactie](https://github.com/Joehoel/throwback/issues/30),
[Verifieer Graph-concurrency tijdens upload sessions](https://github.com/Joehoel/throwback/issues/35),
`docs/adr/0022-verified-conditional-jpeg-metadata-transaction.md`, and
`docs/research/graph-upload-concurrency.md`.

### Recovery

Expected failures are typed and map to durable `retrying`, `waiting_for_reauthentication`, `conflicted`,
or safe `failed` states. **Repair Requirement** is a separate Foto safety block when current bytes cannot be
proved equal to either the target or verified previous state. It blocks edit, skip, and approval and can be
cleared only by byte verification, possibly after external OneDrive version restoration.

Graph network/408/retryable-5xx operations receive four total attempts around 1/4/16-second jittered delays.
Graph 429 follows `Retry-After`, with four total attempts and an automatic single-sleep cap of 15 minutes.
Interactive D1 work receives three attempts; background checkpoints receive five. Constraints, conflicts,
codec failures, auth/configuration errors, and unsafe outcomes do not retry automatically. One failed token
refresh waits for the same Microsoft account to reauthenticate.

A D1 mutation that did not commit never reports success and starts no Workflow. The current tab preserves
its unconfirmed buffer but creates no durable browser mutation queue. During D1 read failure, eligible
persisted Query data may render only as explicitly stale and read-only.

See [Bepaal foutafhandeling en herstelgaranties](https://github.com/Joehoel/throwback/issues/28) and
`docs/adr/0025-recoverable-failures-and-privacy-safe-diagnostics.md` for exact copy, retry epochs,
diagnostic retention, and alerting.

## Technical architecture

- One TanStack Start SPA and same-origin server application is built as one Cloudflare Worker by Alchemy
  v2. SSR is off by default; Start still owns the shell, middleware, protocol routes, and build.
- `src/server/**` contains Effect v4 schemas, HttpApi, services/Layers, auth integration, D1, Graph/Gemini,
  codec, dispatchers, and Workflows.
- `src/client/**` contains React, TanStack Router/Query/Store, shadcn/ui, generated Fetch/Query/Valibot, and no
  Effect import of any kind.
- `src/routes/**` contains thin page or protocol adapters. The domain API is `/api/domain/$`; Better Auth is
  `/api/auth/$`; OpenAPI and interactive docs are `/api/openapi.json` and `/api/docs` behind Access.
- Workflow bindings/runners are internal and never browser-facing. The browser receives no OAuth token and
  does not construct an API auth value; same-origin credentials carry the HttpOnly application and Access
  cookies.
- Effect `HttpApi` and server schemas generate deterministic OpenAPI 3.1. Hey API generates Fetch, TanStack
  Query, TypeScript DTO, and Valibot artifacts. Generated success JSON and centrally intercepted declared
  error JSON are validated; JPEG binary bypasses JSON validation.
- OpenAPI and generated client files are committed and regenerated in CI. Stable custom OpenAPI formats
  generate distinct Valibot/TypeScript identifier brands without casts or Effect browser types.
- SPA and Worker deploy lockstep without URL versions. Every domain request carries the SPA build id; an
  incompatible old tab receives a typed mandatory-reload response before any mutation executes.
- TanStack Router owns resource identity. TanStack Query owns remote and mutation state. One review-route
  TanStack Store owns only transient input and presentation state.
- D1 owns durable auth/application/command status. Approval acceptance writes command plus outbox in one
  transaction; best-effort immediate dispatch and a one-minute reconciler use deterministic Workflow ids.
- Visible Foto/queue reads poll no faster than 30 seconds. Active commands back off 2/5/10 seconds. Polling
  pauses while hidden. An allowlist of confirmed read models may persist in IndexedDB for seven days,
  partitioned by Curator/Library/schema/build and immediately revalidated.

The authoritative stack and migration details are in
[Kies de frontend-, backend- en API-contractstack](https://github.com/Joehoel/throwback/issues/39),
`docs/adr/0023-effect-httpapi-generated-browser-contract.md`, and
`docs/adr/0026-clean-rebuild-and-atomic-production-cutover.md`.

## Implementation sequence

Implementation follows eight coherent slices, each green and testable before the next:

1. boundaries, exact pins, generated contract, isolated preview resources, and empty definitive routes;
2. fresh Better Auth/Curator/Graph/Library setup and new D1 schema;
3. read-only root-delta-to-real-JPEG review tracer;
4. Concept, Resume Point, skip/reopen, route Store, and Query persistence;
5. Generation Commands, Gemini limits, and Suggestion-to-Concept flow;
6. independent streaming codec, Approval Commands, outbox, Workflow, verification, and rollback;
7. recovery, observability, docs, accessibility, and platform hardening; and
8. old-code/dependency removal, release gates, destructive D1 baseline, production deploy, and fresh setup.

The exact ownership and deletion list is normative in
[Bepaal het migratiepad van de twee webappflows](https://github.com/Joehoel/throwback/issues/34) and
`docs/adr/0026-clean-rebuild-and-atomic-production-cutover.md`.

## Release boundary

The release policy is intentionally proportional: compact deterministic regressions run continuously;
private-photo AI evaluation, real Graph fault drills, physical-browser checks, and performance measurements
are one-time signoff work for the relevant v1 candidate. The signed evidence lives in
`docs/release/v1-signoff.md` and contains no Foto identity or metadata.

### Continuous release-candidate gates

Every release candidate must pass, without diagnostic suppression or generated-file edits:

1. frozen dependency installation, formatting, type-aware Oxlint, TypeScript, and all unit/integration tests;
2. deterministic OpenAPI and generated-client regeneration with zero drift;
3. production build plus a bundle/sourcemap scan proving no Effect or server source in browser chunks;
4. import-boundary checks and absence of FSA, local curation, oRPC, XState, TanStack AI, old codec, and their
   production dependencies;
5. D1 migration tests from an empty database and tests for CAS, single-active-command, outbox idempotency,
   leases, status transitions, and build-id rejection;
6. one local workerd/Chromium happy-path smoke using synthetic data and no external provider calls;
7. automated critical accessibility checks plus deterministic keyboard/focus tests for the core flow; and
8. a compact set of approximately 8–12 synthetic or sanitized JPEG fixtures. Together they cover baseline
   and progressive scans, multiple SOS, little-/big-endian EXIF, Orientation 1–8, thumbnail/Interop and
   unknown EXIF tags, standard/extended XMP, multipart ICC, unknown APP/COM segments, full-target
   set/replace/remove combinations, malformed preflight rejection, byte-preservation, and exact reread.

There is no percentage code-coverage gate, external Graph/Gemini call, private Foto, full browser matrix,
or Lighthouse matrix in normal CI.

No known critical or high advisory may exist in shipped runtime dependencies. A high build-only advisory
may remain only when the tool consumes trusted repository input, cannot enter runtime artifacts, and the
signoff records scope, mitigation, and an update watch. This permits the currently isolated Hey API
`js-yaml` advisory but does not normalize it as runtime risk.

### One-time technical v1 gates

Against isolated preview resources and the exact candidate build:

- A real initial root-delta index of the approximately 20,000-Foto Library completes and atomically
  activates within 60 minutes, reports useful progress, and safely resumes after one interruption.
- At least 20 normal online samples establish p95 Concept acknowledgement and Approval Command `202` at or
  below one second, a prefetched next Foto visible within one second, and a cold Foto within 2.5 seconds.
- Five scripted mobile and five desktop review runs meet p75 LCP at or below 2.5 seconds, INP at or below
  200 ms, and CLS at or below 0.1. This is repeated only after a major UI/platform/performance change.
- A 100-MiB synthetic JPEG and the largest real Library JPEG complete the streaming transform path. Two
  concurrent representative image/generation tasks keep total isolate peak memory at or below 80 MiB.
- The compact structure fixtures, five varied disposable real Library copies, and the largest real Foto
  run through the production codec/Graph path. Before/after inspection proves exact scan/ICC/unknown/
  thumbnail/Interop/unmanaged metadata preservation and exact managed-target reread.
- One disposable OneDrive Personal round is executed for each compact fixture structure class. Three extra
  drills cover interrupted-fragment resume, a mid-upload external write, and uncertain commit plus
  conditional version rollback. No stale session or rollback overwrites the external write, and unsupported
  structures fail before upload.
- Marker-based traffic and storage inspection proves that browser requests contain no OAuth token; Gemini
  receives only the allowed derivative/context; and forbidden bytes, identifiers, paths, metadata,
  coordinates, text, headers, tokens, provider bodies, or provider request ids do not enter D1 fields,
  Worker logs, browser persistence, or Sentry contrary to their declared boundaries.
- The three manual recovery drills pass: same-account reauthentication resumes only an unchanged base;
  mid-upload concurrency becomes conflict without overwrite; and Repair Requirement clears only after byte
  proof, including the external OneDrive restore path.
- Cron/demand delta, one-minute outbox reconciliation, Generation leases/two-call concurrency, daily/monthly
  caps, AI circuit, Sentry redaction, and configured alerts are exercised once with synthetic markers.
- The production baseline migration, Worker/assets deploy order, protected OpenAPI/docs, Access gate,
  Better Auth callback, setup flow, and authenticated smoke have a written roll-forward runbook.

There is no formal uptime percentage for one private Curator. Provider or platform outages must remain
visible and recoverable according to the error contract.

### One-time physical platform and accessibility gate

The Curator completes the core setup/review/edit/autosave/approve/continue/skip/reopen/error journey once on
a physical current iPhone Safari, actual macOS Safari and Chrome, and actual Windows Edge and Chrome.
Automation supplements but does not replace this v1 signoff. The full matrix repeats only after a major UI
or platform-boundary change.

The app makes no formal WCAG conformance claim. The following are nevertheless release-blocking functional
requirements: no keyboard trap; the desktop core flow is keyboard-operable; controls and fields have
correct accessible names/labels; focus is visible and not obscured; status/error changes are announced;
meaning is not color-only; text and controls remain readable at required contrast; 200% zoom/reflow does
not lose content or actions; mobile controls meet the 44-pixel product target; and iPhone portrait and
landscape remain operable. Other accessibility polish may follow the waiver policy.

### Gemini enablement gate

Gemini remains disabled while evaluating an exact profile hash comprising model/version, derivative
pipeline, prompt, response schema, Event context, and abstention rules. The Curator blindly reviews a
preselected stratified set of 30 Fotos spanning decades, scans/digital images, indoor/outdoor scenes,
people/objects, image quality, Orientation, and missing Location. The evaluator does not tune the profile
after seeing results.

The profile passes only when:

- at least 24 of 30 Description Suggestions are directly usable or need only a minor stylistic edit with
  no factual correction;
- there are zero invented identities/Events or other materially harmful factual claims;
- at least 10 evaluated Fotos lack an effective Location;
- at least five Location hints are useful at the displayed place/region precision;
- at least 80% of all emitted Location hints are useful, with zero materially wrong confident hints; and
- provider retention disclosure, Library AI toggle, cancellation, limits, cost reservation, and manual
  fallback behave as specified.

Only content-free aggregate counts, latency, token use, cost, profile hash, date, and pass/fail enter the
signoff. No Foto id, image, Description, Suggestion, place, or rationale is retained. Failure does not block
the manual Curation webapp release; it keeps production AI off until a changed exact profile passes. Any
change to model, prompt, schema, derivative, Event context, or abstention rules reruns this gate.

### Waivers, signoff, and post-cutover smoke

No waiver is allowed for canonical JPEG integrity, conflict/rollback safety, auth or privacy boundaries,
the core review journey, required platform support, or the minimum accessibility operation above. A
non-critical visual, accessibility-polish, or performance diagnostic may be waived only in the committed
signoff with owner, rationale, affected build, risk, and follow-up date.

The implementing developer or agent signs technical and automated evidence. The Curator signs physical
workflow/device behavior and the blind Gemini assessment. Manual gates are rerun only when the relevant
boundary changes: AI profile, JPEG codec/write protocol, or major UI/platform/performance behavior.

After the roll-forward-only production cutover, an authenticated smoke covers Access, login/claim, setup,
domain API, preview, Concept acknowledgement, and a disposable approval. If it fails, AI and writes stay
disabled, the host remains behind Access in maintenance/read-only mode, and recovery fixes forward. An old
Worker is never restored against the new schema.

## Out of scope

- production implementation inside this planning effort;
- native installation or app-store distribution;
- offline reads as a supported mode, offline edits, or browser mutation replication;
- multiple Curators, role management, assignments, or collaborative editing;
- non-JPEG metadata writes or pixel rotation;
- automatic identity recognition, face naming, or metadata approval;
- provider Batch/Files/grounding/background APIs;
- sharing D1 or UI state with the Fotoshow; and
- recurring enterprise-style certification matrices when the relevant boundary has not changed.
