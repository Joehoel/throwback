# Proportional v1 release evidence

The first Curation webapp release uses a small continuous correctness suite plus one-time evidence for the
exact candidate build. Private Fotos, paid Gemini evaluations, physical-device matrices, real Graph fault
injection, and performance profiling do not run in routine CI: they are expensive, privacy-sensitive, and
disproportionate for one Curator. Their signed, content-free results are committed once and repeated only
when the relevant AI, JPEG/write, or UI/platform boundary changes.

Routine CI still blocks on frozen install, format, type-aware lint, typecheck, deterministic contract/client
generation, D1 and workerd tests, one synthetic Chromium smoke, production build and browser-bundle
boundaries, plus a compact sanitized JPEG preservation corpus. Runtime dependencies may have no known high
or critical advisory. A high build-only advisory requires trusted input, runtime exclusion, a recorded
mitigation, and an update watch.

The one-time v1 gate proves the real approximately 20,000-Foto index within 60 minutes; 100-MiB streaming
under an 80-MiB two-task isolate peak; real JPEG/Graph preservation, interruption, conflict and rollback;
the five target browser/device combinations; one compact cross-device scenario; three critical recovery
drills; marker-based privacy boundaries; and good Core Web Vitals from five mobile and five desktop runs.
The app makes no formal WCAG claim, but inaccessible core operation remains a release blocker.

Gemini enablement is a separate gate over the exact profile. Thirty stratified Fotos must yield at least
80% usable Description Suggestions with no serious hallucination. At least ten Fotos are Location-eligible;
the profile must produce at least five useful hints, at least 80% useful precision among emitted hints, and
no serious confident error. Failure leaves manual curation releasable but keeps AI disabled.

The committed signoff contains build/profile hashes, devices, dates, aggregate results, waivers, and
separate technical and Curator approval, never Foto identity or metadata. Only non-critical polish may be
waived. Canonical metadata integrity, auth/privacy, core workflow, target-platform operation, and minimum
accessible operation cannot.

## Status

**Accepted (2026-09-12).** Exact checks and signoff fields are normative in
`docs/specs/integrated-curation-webapp.md` and `docs/release/v1-signoff.md`.
