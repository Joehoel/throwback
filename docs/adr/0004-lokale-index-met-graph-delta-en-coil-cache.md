# Lokale index (Room) als bron van waarheid, gevuld via Graph delta, met Coil-cache

De bibliotheek telt tienduizenden foto's in een diepe mappenboom. Eisen: snel kunnen starten zonder eerst alles te laden, nieuwe foto's vanzelf oppikken, cachen binnen een opslag-budget, en haperingsvrij vooruit/terug.

Gekozen architectuur (volgt Google's aanbevolen "netwerk → database → UI"-patroon):

- **Room (SQLite)** is de lokale index en bron van waarheid; de Fotoshow speelt uitsluitend uit de index.
- **Microsoft Graph `delta`** (`/me/drive/root/delta`, delegated, scope `Files.Read`) vult de index. De eerste crawl streamt pagina's binnen — afspelen begint zodra de eerste pagina er is. De `@odata.deltaLink` wordt bewaard; volgende keren halen we alleen wijzigingen op. Geen webhooks (bestaan niet voor consumenten-OneDrive) — we pollen delta bij opstart.
- **Coil** verzorgt beeldladen met een geheugen- + schijfcache met harde maximum-grootte. We laden TV-formaat thumbnails (~1920px) i.p.v. volle resolutie. Thumbnail-/download-URL's zijn kortlevend en worden niet opgeslagen — vlak vóór weergave ververs je ze per `id`.
- **Afspeellijst** in geheugen: een geschudde lijst van foto-`id`'s + `currentIndex` (O(1) vooruit/terug), met een prefetch-venster rond de huidige positie.

## Considered Options

- **Paging 3 met RemoteMediator** — het canonieke netwerk→DB→UI-patroon. We lenen het *principe* (Room als bron van waarheid), maar niet de Paging-UI-laag: die is voor scrollende lijsten, niet voor een slideshow met shuffle en handmatig vooruit/terug. In plaats daarvan een eigen lichte sequencer.
- **Elke start volledig opnieuw scannen** — verworpen: minuten wachten bij de aantallen hier.

## Consequences

- Referentie-implementatie om uit te leren: AerialViews (Android TV-screensaver in Kotlin met remote-media + caching).
- Vroege verificatie nodig dat het `description`-veld via Graph terugkomt (zie ADR-0002).

## Update (2026-05-29) — delta geeft géén `description`

Empirisch bevestigd (`spike/probe_delta_description.py`): het Graph **delta**-endpoint geeft het `description`-veld **niet** terug op persoonlijke OneDrive — ook niet met `$select`. Het `children`/`GET`-endpoint geeft het wél.

Gevolgen voor het ontwerp:
- **Initiële index gaat via een recursieve `children`-crawl** in plaats van delta. `children` levert per foto de `description`, en tijdens het aflopen kennen we per map al de gebeurtenis + jaar (uit het pad). Streamt map-voor-map, dus afspelen kan vroeg starten.
- **Delta blijft een latere optimalisatie** voor goedkoop incrementeel verversen — eventueel hybride: delta om te detecteren *wat* veranderde, en alleen voor die items de `description` bijhalen (per `GET`/`$batch`).
- Implementatiedetail: de lokale index is **handgeschreven SQLite** (`PhotoDb`) i.p.v. Room — zelfde rol, geen KSP/annotation-processing (lager bouwrisico met AGP 9).

## Update 2 (2026-05-29) — hybride delta-verversing, ingebedde EXIF-bijschriften, geocoden bij indexeren

Empirisch onderzocht op de echte familie-bibliotheek (read-only via het toestel-token):

- **Bijschrift staat soms alleen in de ingebedde fotometadata.** OneDrive's nieuwe persoonlijke
  opslag-backend (item-id's met `!s…`, uploads vanaf ~april 2025) geeft het bijschrift níét meer terug
  als `driveItem.description` — ook niet via `GET`, listItem-velden of een extra scope. Het stáát wel in
  het bestand: Windows' "Details"-tabblad (Titel/Onderwerp/Opmerkingen) schrijft naar EXIF
  `ImageDescription` + XMP `dc:description`/`dc:title`. Oudere foto's hadden dat nog wél in
  `driveItem.description` (OneDrive extraheerde het toen). **Gevolg:** als `driveItem.description` leeg is,
  lezen we het bijschrift uit de ingebedde metadata. EXIF/XMP zit vooraan in de JPEG (binnen ~16 KB), dus
  een Range-`GET` van de eerste 32 KB volstaat — geen volledige download. Zie `ExifCaption` /
  `EmbeddedCaptionText`. Geen extra Graph-scope nodig (`Files.Read` mag content lezen).
- **Hybride verversing.** Eerste keer (en na een logica-upgrade, via een `reconcile_tag` in `meta`) een
  volledige `children`-crawl; daarna seedt `token=latest` een `@odata.deltaLink` en draait een
  periodieke (10 min) delta-lus die alleen wijzigingen ophaalt. Delta levert geen `description`, dus per
  gewijzigd item halen we het volledige item op (+ dezelfde EXIF-fallback). Verwijderingen komen als
  `deleted`-facet binnen en vallen uit de lopende afspeellijst. Nieuwe/bewerkte foto's verschijnen
  zónder herstart (de show leest elke dia opnieuw uit de index).
- **Locatie wordt bij het indexeren gegeocodet** naar een plaats-label (kolom `place`, schema v3),
  i.p.v. per weergave op de main-flow. Label: straat (+ huisnummer), plaats, land alleen indien buiten
  NL; zinloze "Unnamed Road" valt weg. Zie `PlaceResolver` / `PlaceLabel`.
- **Migratie is additief** (`ALTER TABLE ADD COLUMN`) i.p.v. de index droppen, zodat een upgrade de grote
  bibliotheek niet opnieuw hoeft te downloaden.
