# Beheer-webapp houdt een eigen foto-index in D1

De **Beheer-webapp** bouwt z'n eigen foto-index in Cloudflare D1 (per foto: id, map, jaar, heeft-Beschrijving, heeft-Locatie, review-status), gevuld via een children-crawl van de gekozen **Hoofdmap** — los van de Room-index die de TV-app (**Fotoshow**) op het kastje bijhoudt. De Room-index leeft op het Android-apparaat en is niet bereikbaar vanuit de webapp; een gedeelde index zou een nieuwe web↔TV-koppeling vergen die we niet willen.

## Considered Options

- **Eigen D1-index** (gekozen): latere sessies starten direct, en review-status (afgehandeld/overgeslagen) overleeft sessies — nodig omdat dad duizenden foto's over meerdere zittingen naloopt.
- **Live crawl per sessie**: verworpen, trage eerste load bij ~20k foto's en geen geheugen van wat al overgeslagen is.
- **TV-index hergebruiken**: niet haalbaar (on-device SQLite).

## Consequences

- De index dupliceert het *concept* van de TV-index, maar niet de data — beide crawlen onafhankelijk dezelfde **Bibliotheek**. Bewust: de twee apps blijven ontkoppeld.
- D1-binding is per-request `env`, geen module-global (zie `web/`-opzet) — de index-queries volgen hetzelfde per-request-patroon als better-auth.
- Sync: crawl bij eerste koppeling + handmatige re-sync-knop; na een geslaagde write wordt de review-status meteen bijgewerkt zonder her-crawl.
- De D1-index is óók de bron voor de **pending writes** van de optimistische mutatie-wachtrij (de server-side flusher leest hieruit), zodat goedgekeurde wijzigingen het sluiten van de browser-tab overleven.

> **Noot (2026-06-06):** de kolommen `heeft-Beschrijving` / `heeft-Locatie` (booleans) zijn vervangen
> door **nullable inhoudskolommen** `description TEXT NULL` en `location TEXT NULL` (JSON). `NULL` =
> ontbreekt; "mist Beschrijving" = `WHERE description IS NULL`. Een afgeleide boolean over "is dit veld
> gezet?" is overtollige staat — de optionele waarde *is* de aanwezigheid. Gevolg: de index draagt nu de
> echte content (iets zwaarder, tweede kopie), maar het reviewscherm is self-sufficient (geen losse
> Graph-call) en het past op het bestaande "D1 spiegelt muteerbare staat" patroon hierboven. Zie
> `docs/design/domain-model.md` §2/§4.
