# Bestandsmetadata wordt de bron van waarheid; Beschrijving canoniek in XMP

De vader heeft de hele **Bibliotheek** lokaal gesynct staan (OneDrive-client op zijn laptop). De **Beheer-webapp** cureert daarom rechtstreeks op die lokale bestanden via de **File System Access API** en schrijft metadata **in het bestand** (XMP/EXIF); OneDrive's eigen sync-client propageert de wijziging omhoog. Daarmee wordt de **embedded bestandsmetadata de bron van waarheid** en wordt OneDrive sync/transport. Dit herziet het leespad-kader van ADR-0001 (OneDrive = bron, app leest uitsluitend Graph) en de keuze van ADR-0002 (Beschrijving uit `driveItem.description`).

**Beschrijving** is canoniek **XMP `dc:description`** (UTF-8, cross-format). **Locatie** en **Oriëntatie** blijven in **EXIF** (GPS-IFD + Orientation-vlag), want dat is wat camera's, renderers en het Graph `location`-facet lezen (ADR-0008 ongewijzigd).

## Aanleiding (empirisch, `~/Pictures/2007`, 372 JPG's)

Elke foto had de caption al op vijf plekken tegelijk: EXIF `ImageDescription`, Windows `XPTitle`+`XPSubject`, XMP `dc:title`+`dc:description`. Beslissend: **EXIF `ImageDescription` is mojibake voor Nederlandse accenten** (`JoÃ«l` i.p.v. `Joël`), terwijl XMP (`dc:description`, UTF-8) en de UTF-16 XP-tags correct zijn. XMP werkt bovendien in JPEG **én** PNG/HEIC (de bibliotheek is gemengd); EXIF-GPS bestaat praktisch niet voor PNG. Vandaar XMP canoniek voor tekst, EXIF voor GPS/oriëntatie.

## Considered Options

- **A — OneDrive blijft bron + Graph-write-pad** (ADR-0001/0002/0011): verworpen als hoofdrichting; vergt de zware per-foto download→injecteer→re-upload-workflow, en `driveItem.description` koppelt aan OneDrive Personal (ADR-0002).
- **B — Bestanden als bron, lokaal-direct schrijven** (gekozen): de webapp bewerkt het gesyncte bestand; OneDrive synct. Schrapt de Graph-write-machinerie voor dit pad.
- **C — Volledig ontkoppelen, incl. de Fotoshow nú**: te groot; het TV-leespad ombouwen naar bestand-XMP is **uitgesteld** ("komt later").

## Consequences

- **ADR-0011 (per-foto Cloudflare Workflow) wordt overbodig** voor het lokaal-directe schrijfpad: geen download/injecteer/re-upload/async-facet-polling meer. (Geldt zolang lokaal-via-FSA hét schrijfpad is.)
- **Ontkoppeld van OneDrive ≠ ontkoppeld van de server.** De **review-boekhouding** (`needs_review`/`handled`/`skipped`) blijft in de eigen **D1** (ADR-0009 blijft), níét in het bestand. Splitsing: **metadata leeft in het bestand**, de **review-status in D1**. Sleutel per foto = het lokale (relatieve) pad; een latere koppeling met de OneDrive-`DriveItemId` (zodat de Fotoshow óók "gereviewd" kan tonen) is uitgesteld.
- **Nieuwe curatie-codepaden hangen niet aan de OneDrive-laag** (P4) / Graph-delta (ADR-0004); die blijven sluimeren (de TV-app gebruikt ze nog). Niet slopen, wel buiten de nieuwe paden houden.
- **De Fotoshow (TV) leest Beschrijving voorlopig nog via Graph `driveItem.description`.** Tot het TV-leespad XMP leest, verschijnt een uitsluitend-naar-XMP geschreven beschrijving níét op de TV. Locatie/oriëntatie landen wél (EXIF → Graph-facet, ADR-0008).
- **Cureren vereist de webapp dáár waar de bestanden staan** (zijn laptop, Chromium/FSA). Geen cureren vanaf telefoon/ander device.
- **Schrijfgedrag Beschrijving**: canoniek XMP `dc:description`; spiegelen naar `dc:title` + Windows `XPTitle`/`XPSubject` (UTF-16, accent-veilig) zodat de Verkenner-weergave klopt; EXIF `ImageDescription` niet meer schrijven (corrupte bron). Lezen: `dc:description` → `dc:title` → `XPTitle` → EXIF (laatste).
- **Codec-ontwerp**: pure `ExifCodec` + `XmpCodec` achter een `PhotoMetadata`-facade, los van de bron/IO-naad (`PhotoSource`), zodat dezelfde codecs zowel het lokale FSA-pad als (later) een OneDrive-pad voeden. De **bytes→`Photo`-projectie is een decode-only Schema-transform** (zoals `graph.ts`); de **write is een imperatieve lossless-inject, géén Schema-`encode`** — schrijven mergt in de bestaande bytes (ICC/XMP/pixels behouden), wat Schema's waarde-only encode niet kan uitdrukken.
- **Lossless-nuance**: visueel lossless (pixels + ICC-profiel ongemoeid; geverifieerd: piexifjs EXIF-write behoudt de XMP- en ICC-segmenten), maar **niet byte-identiek** — piexifjs laat de EXIF-thumbnail bij de round-trip vallen.

## Status

**Richting bepaald (2026-06-07).** Lokale **lees**-fase gebouwd (`/curate`, File System Access). Open / nog te bouwen:
- **Write-fase**: XMP/PNG/HEIC-metadata via een geschikte **library met Effect-wrapper** (akkoord deps toe te voegen) i.p.v. per se eigen code; lossless APP1/chunk vervangen en behoud van de EXIF-thumbnail blijven verifieerpunten.
- **Format-dekking**: PNG/HEIC voor GPS (EXIF werkt daar niet; XMP `exif:`-GPS of overslaan).
- **TV-leespad**: Fotoshow Beschrijving uit bestand-XMP laten lezen, en de D1-review-status koppelen aan de OneDrive-`DriveItemId` (beide uitgesteld).
- **Sync-conflicten**: buiten scope — de OneDrive-client op de laptop handelt dat af.
