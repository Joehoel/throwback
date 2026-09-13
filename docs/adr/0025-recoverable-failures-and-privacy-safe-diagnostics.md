# Recoverable failures and privacy-safe diagnostics

The Curation webapp represents expected failures as structured Effect `Schema.TaggedError` values and
durable domain statuses. It retries only operations proven safe and idempotent, preserves every confirmed
Concept and accepted command, and tells the Curator what happened, what remains safe, and what action can
resolve it. Unexpected defects fail loudly with a privacy-safe incident reference.

## Failure classes and durable status

Active work distinguishes `running` from `retrying`; retrying records the attempt, retry epoch, and next
attempt time. Terminal or human-gated outcomes use four ordinary classes plus one safety block:

- `waiting_for_reauthentication`: the Microsoft grant cannot currently authorize Graph work. One token
  refresh has already failed. The same Microsoft account must reconnect before fresh Graph validation can
  resume the command.
- `conflicted`: the Foto base, Graph tags, item identity state, or D1 projection revision changed. There is
  no automatic retry or merge; the Curator compares the preserved target with the current Foto and creates
  a new Approval Command.
- `failed`: automatic recovery is exhausted or the operation is permanently unsupported, but the
  application has proved that canonical Foto bytes were not changed or were safely restored. The Foto
  remains `needs_review`; Concept and command payload remain available.
- a global blocked/stale condition: D1, Library scope, Graph ingest, or provider configuration prevents a
  class of work. It appears as a persistent system banner rather than being copied into every Foto status.
- `repair_required`: Graph may have committed bytes that the app cannot prove to equal either the approved
  target or the verified previous version. This is a durable **Repair Requirement** on the Foto, not an
  ordinary failure or conflict.

A Foto with a Repair Requirement is excluded from normal review and rejects skip, edit, and new approval
mutations. The application first downloads and verifies the current JPEG again. It clears the requirement
only when bytes prove to be the complete approved target or the verified previous state. Otherwise the UI
opens OneDrive for external version restoration and repeats byte verification afterward. A visual “looks
good” confirmation, database edit, Graph facet, or unverified manual override can never clear it.

Generation Commands add `retrying` and, when their source Foto cannot be fetched, may wait for
reauthentication. `no_suggestion` and policy/safety abstention remain normal non-error outcomes. A Library-
wide AI configuration failure opens an AI circuit: queued work does not start, no new jobs are created, and
manual curation remains available. A successful configuration health check closes the circuit; individual
Fotos do not repeatedly test a known-bad key or model.

## Automatic retry budgets

Retry counters are durable wherever work outlives a request. Attempts never reset because a Worker or
Workflow restarts.

- An idempotent Graph, delta, or geocoding operation receives four total attempts for a network failure,
  `408`, or retryable `5xx`, with jittered delays of approximately 1, 4, and 16 seconds.
- A Graph `429` receives four total attempts and follows `Retry-After`. One automatic sleep is capped at 15
  minutes; without that header it uses the ordinary jittered schedule. A longer provider delay ends the
  automatic epoch and prevents a manual retry before the stated time rather than retrying early.
- Interactive D1 work receives three total attempts: the initial call, then approximately 50 and 200 ms
  later. Constraint, validation, authorization, CAS, and conflict failures never retry.
- Background D1 checkpoints receive five total attempts with jittered delays of approximately 1, 4, 16,
  and 60 seconds.
- Gemini retains its existing three-total-attempt budget, allowed transient statuses, cost reservation,
  and daily/monthly caps. A quota, safety, schema, domain, auth, or configuration outcome never consumes an
  unbounded retry loop.
- Graph authentication receives one refresh attempt and then transitions to
  `waiting_for_reauthentication`. A version or precondition mismatch transitions directly to `conflicted`.

An interrupted upload resumes the same upload session and fragments where Graph still permits it. An
uncertain final commit is reconciled by reading tags and JPEG bytes: an exact target completes, the exact
old state may continue within the same retry epoch, and any third state conflicts or requires repair under
ADR-0022. Automatic exhaustion produces `failed`; it never silently creates a fresh command.

For an exhausted but safe Approval Command, **Try again** starts one new four-attempt retry epoch on the
same immutable command. The server first rereads Graph and the D1 base. An unchanged base resumes; a change
becomes `conflicted`. Only one epoch may be active, and every epoch is audited. Generation retries remain
subject to all cost and rate caps.

A deterministic codec, malformed-JPEG, unsupported-shape, or preservation failure detected before upload
does not offer an immediate retry that can only repeat the same result. It preserves the Concept, marks the
command `failed`, offers **Skip**, and becomes recheckable after a new codec version is deployed. If
post-write verification fails but the previous bytes are conditionally restored and verified, the result
is likewise safe `failed` and may later retry after a fresh base check. Only an unproved resulting byte
state becomes `repair_required`.

OneDrive capacity or policy failures are actionable `failed` outcomes with a provider-specified not-before
time where available. A missing or revoked grant waits for reauthentication; an unavailable selected root
folder follows ADR-0024's read-only Library recovery instead of masquerading as authentication success.

## D1 and browser-loss guarantees

A Concept save, skip, Resume Point update, or command acceptance that cannot commit to D1 never returns a
success response. No Workflow starts. The still-open browser preserves its input buffer and offers retry;
it does not create a persistent browser mutation queue. During a D1 read outage, an eligible seven-day
Query cache may render a clearly stale read-only view, but all mutations remain blocked until the server
can confirm current state.

Closing a tab cannot cancel an accepted command or a running background operation. Conversely, an
unconfirmed in-memory keystroke is not represented as durable: short Concept autosave, serialized browser
requests, navigation waiting, and best-effort `beforeunload` remain the continuity boundary. The app never
claims that an unacknowledged D1 write survived closure.

## User-facing presentation and copy

Foto- and command-specific failures remain visible in the editor and filmstrip. Systemic auth, D1, sync,
Library, build, or AI-circuit conditions use a persistent global banner. Toasts may acknowledge a change
but are never the only location of a recoverable error. Provider codes, attempt details, and the incident
reference live under **Details**, not in primary copy.

The Dutch copy is short, neutral, and action-oriented:

| Condition | Primary copy | Primary action |
| --- | --- | --- |
| Retrying approval | **Opslaan lukt nog niet. We proberen het opnieuw.** | None while scheduled |
| Reauthentication | **Verbind OneDrive opnieuw om deze opdracht te hervatten.** | **OneDrive verbinden** |
| Conflict | **Deze foto is gewijzigd. Bekijk hem opnieuw voordat je goedkeurt.** | **Bekijk opnieuw** |
| Safe exhausted failure | **Opslaan is mislukt. Je Concept is bewaard.** | **Opnieuw proberen** |
| Permanent pre-write codec failure | **Deze foto kan niet veilig worden aangepast.** | **Overslaan** |
| Repair Requirement | **Deze foto moet in OneDrive worden gecontroleerd.** | **Controleer opnieuw** / **Open OneDrive** |
| Unconfirmed D1 mutation | **Opslaan is niet bevestigd. Je invoer staat nog in dit venster.** | **Opnieuw proberen** |
| D1 cached read-only mode | **De server is tijdelijk niet bereikbaar. Je bekijkt opgeslagen gegevens.** | **Opnieuw laden** |
| Stale Graph projection | **OneDrive is niet bijgewerkt. Doorgaan kan een conflict opleveren.** | **Synchroniseer** |
| Missing root folder | **De Hoofdmap is niet bereikbaar. Herstel de koppeling om verder te gaan.** | **Koppeling herstellen** |
| AI circuit open | **Suggesties zijn tijdelijk uitgeschakeld. Je kunt handmatig verder.** | **Opnieuw controleren** |
| No AI result or policy abstention | **Geen suggestie beschikbaar.** | Optional **Nieuwe suggestie** |
| OneDrive capacity | **OneDrive heeft onvoldoende ruimte. Maak ruimte vrij en probeer opnieuw.** | **Opnieuw proberen** |
| Unexpected client/server defect | **Er ging iets mis. Probeer opnieuw. Referentie: {incidentId}.** | **Details** / **Opnieuw proberen** |

Actions appear only when safe. In particular, retry is disabled while an attempt or not-before delay is
active, and Repair Requirement never offers Skip or force-complete.

## Diagnostics, retention, and alerting

Every expected error carries a stable tag and structured non-content fields such as subsystem, operation,
phase, retryability, attempt, retry epoch, normalized HTTP status class, and next attempt time. Causes stay
available inside the server Effect for diagnosis but are normalized and sanitized before crossing HTTP,
D1, logs, or Sentry boundaries.

D1 keeps the terminal error summary with its durable command. Content-free per-attempt rows are retained
for 30 days and then deleted or reduced to aggregate counts. A provider request id may remain in D1 for at
most seven days, never alongside metadata content, and is never sent to Sentry.

Each reportable incident receives a fresh random incident id. D1 maps it to the relevant internal record;
Sentry receives only that incident id, release/environment, error tag and subsystem, phase, attempt counts,
status class, timing, and sanitized stack/cause category. Sentry never receives DriveId, DriveItemId, Foto
or command id, folder path or name, JPEG/preview bytes, metadata values, Concept or Suggestion text, prompt
context, coordinates/place names, URL query strings, headers, cookies, OAuth/SAS material, raw provider
bodies, or provider request ids. Session Replay remains disabled.

Expected retries produce spans and metrics, not one event per attempt. Sentry receives events for exhausted
failures, unexpected defects, and circuit openings. Alerts fire immediately for `repair_required`, D1 write
unavailability, and auth or provider-configuration circuits; three exhausted failures from the same
subsystem within 15 minutes also alert. Expected single conflicts, abstentions, skips, and successfully
recovered retries do not page anyone.

## Consequences for existing decisions

- ADR-0007's Sentry choice and privacy posture remain; this ADR supplies the webapp's correlation,
  redaction, retention, event, and alert policy.
- ADR-0011 and ADR-0022 retain their durable Workflow and verified-write protocols; this ADR fixes their
  concrete retry epochs and terminal recovery states.
- ADR-0021's one-refresh reauthentication boundary, ADR-0024's stale/read-only sync behavior, and the
  Concept, command, and Resume Point continuity decisions are confirmed.
- The earlier Approval and Generation Command status lists are extended with `retrying`,
  `waiting_for_reauthentication`, and where applicable `repair_required`; these are technical lifecycle
  states, never review outcomes.

## Status

**Accepted (2026-09-12).** This is the failure, recovery, user-copy, and privacy-safe observability contract
for the integrated Curation webapp.
