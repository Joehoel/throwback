# Curation webapp v1 release signoff

Status: **pending implementation**. This file is the content-free evidence record for the exact release
candidate. Do not add Foto ids, names, paths, image/metadata content, Suggestion text, places, coordinates,
tokens, provider bodies, or provider request ids.

## Candidate identity

- Git commit/build id: `TBD`
- Production dependency lock hash: `TBD`
- D1 baseline migration hash: `TBD`
- OpenAPI artifact hash: `TBD`
- Generated browser-client hash: `TBD`
- Gemini profile hash or `AI disabled`: `TBD`
- Preview environment: `TBD`
- Evidence date: `TBD`

## Continuous gates

- [ ] Frozen install, format, type-aware lint, typecheck, and tests pass.
- [ ] OpenAPI/client generation is deterministic and has no drift.
- [ ] D1 migration, CAS, outbox, lease, status, and build-id tests pass.
- [ ] Compact sanitized JPEG preservation/rejection corpus passes.
- [ ] Local workerd and synthetic Chromium smoke pass.
- [ ] Production build and browser bundle/sourcemap boundary scan pass.
- [ ] Removed prototype transports, state engines, routes, codecs, and dependencies are absent.
- [ ] Runtime dependency audit has no known high or critical advisory.
- [ ] Any accepted build-only advisory is recorded under Waivers with mitigation and update owner.

## One-time technical gates

- [ ] Real initial Library index activates within 60 minutes and resumes after interruption.
- [ ] Domain interaction latency targets pass over at least 20 normal samples.
- [ ] Five mobile and five desktop runs pass LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1 at p75.
- [ ] 100-MiB streaming and largest-real-Foto paths pass; two-task isolate peak is ≤80 MiB.
- [ ] Compact fixture classes, five real disposable copies, and largest real Foto preserve all unmanaged
      structures and reread the full managed target exactly.
- [ ] OneDrive Personal fixture-class rounds and three interruption/concurrency/rollback drills pass.
- [ ] Synthetic privacy markers are absent from every forbidden browser, D1, log, and Sentry destination.
- [ ] Reauthentication, mid-upload conflict, and Repair Requirement manual drills pass.
- [ ] Delta/outbox/generation schedules, caps, circuit, redaction, and alerts are exercised.
- [ ] Baseline/deploy/smoke/fix-forward runbook is current.

Technical evidence summary (aggregate only): `TBD`

Technical signoff — name, date: `TBD`

## Curator platform and workflow gate

- [ ] Physical current iPhone Safari.
- [ ] Actual macOS Safari.
- [ ] Actual macOS Chrome.
- [ ] Actual Windows Edge.
- [ ] Actual Windows Chrome.
- [ ] Compact cross-device Concept/LWW/approval/conflict/tab-close/Resume Point scenario.
- [ ] Keyboard, names/labels, focus, announcements, contrast, 200% zoom/reflow, mobile target size, and both
      iPhone orientations meet the minimum operation gate.

Curator workflow notes without private content: `TBD`

Curator platform signoff — name, date: `TBD`

## Gemini enablement gate

- [ ] Exact model/derivative/prompt/schema/Event-context/abstention profile is frozen and hashed.
- [ ] Thirty Fotos were selected before evaluation using the required strata.
- [ ] Usable Description Suggestions: `TBD / 30` (must be at least 24).
- [ ] Serious Description hallucinations: `TBD` (must be zero).
- [ ] Location-eligible Fotos: `TBD` (must be at least 10).
- [ ] Useful Location hints: `TBD` (must be at least 5).
- [ ] Total emitted Location hints: `TBD`; useful precision: `TBD%` (must be at least 80%).
- [ ] Serious confident Location errors: `TBD` (must be zero).
- [ ] Disclosure, toggle, cancellation, limits, reservation, and manual fallback pass.

Gemini result: `TBD — enabled / remains disabled`

Curator Gemini signoff — name, date: `TBD`

## Waivers

Only non-critical polish may appear here. For each waiver record owner, rationale, affected build, risk,
and follow-up date. Write `None` when empty.

`TBD`

## Production cutover

- [ ] Destructive baseline and matching Worker/assets deploy completed in the documented order.
- [ ] Authenticated Access/login/claim/setup/API/preview/Concept/disposable-approval smoke passed.
- [ ] On smoke failure, AI and writes remained disabled and recovery fixed forward.

Final technical release signoff — name, date: `TBD`

Final Curator release signoff — name, date: `TBD`
