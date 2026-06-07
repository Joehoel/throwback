# OneDrive-writes via per-foto Cloudflare Workflows

Het terugschrijven van **Locatie** + **Oriëntatie** naar OneDrive (ADR-0008: download → EXIF injecteren → re-upload) gebeurt in **Cloudflare Workflows**, met **één workflow-instance per goedgekeurde Foto**. Stappen: token ophalen → originele bytes downloaden → GPS + Orientation lossless injecteren (piexifjs) → re-uploaden → het `location`-facet verifiëren. De UI is optimistisch en peilt de D1-review-status; de instance werkt die status bij.

## Waarom durable execution

De write is geen simpele request-actie: Graph extraheert foto-metadata **asynchroon** (~6–9 s, spike `verify_location_write.py`), throttelt bij bursts (429/`Retry-After`), en een goedgekeurde gebeurtenis levert tot ~50 writes. Een durable engine geeft per stap **retry met backoff**, `step.sleep` voor de async-extractie (slapende instances tellen niet mee voor concurrency), en overleeft het sluiten van de browser-tab — precies wat een in-request-write mist.

## Considered Options

- **Per-foto Workflows** (gekozen): isoleert fouten, retry per foto, status 1-op-1 met de D1 per-foto review-status (ADR-0009).
- **Per-gebeurtenis-instance**: minder instances, maar ~200 stappen voor een map van 50, grovere foutafhandeling, per-foto-status lastiger terug te mappen.
- **In-request Worker-write + D1 pending-tabel**: simpelst, geen extra infra, maar geen nette async-sleep/retry en kwetsbaarder bij tab-sluiten/throttling.

## Token in een losgekoppelde context

Een workflow draait buiten het HTTP-request en kan de better-auth-sessie niet gebruiken. **Geverifieerd:** better-auth's `auth.api.getAccessToken({ body: { providerId: 'microsoft', userId } })` werkt **sessieloos** (alleen `userId`, geen headers) en ververst zelf bij verloop. De workflow krijgt de niet-geheime `userId` als param, bouwt een better-auth-instance op de D1-binding + secrets, en haalt vlak vóór elke Graph-stap een vers token. Geen los token-endpoint nodig.

## Consequences

- Hangt aan ADR-0010: de Workflows-binding wordt in Alchemy gemodelleerd (of handmatig tot v2 de resource heeft).
- Alleen JPEG schrijft locatie/oriëntatie (ADR-0008); andere formaten worden in de lus overgeslagen voor locatie. Beschrijving blijft een goedkope Graph-`PATCH` (ADR-0002), buiten de workflow.
- Re-upload bumpt de modified-timestamp → de TV-app (**Fotoshow**) her-crawlt het item (gewenst).

## Status

**Geaccepteerd (2026-06-05), bouw nog te starten.**
