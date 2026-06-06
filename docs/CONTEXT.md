# Throwback

Een Android TV-app die de familiefotobibliotheek uit OneDrive als schermvullende slideshow op de TV toont, met titel en jaar in beeld. Gebruikt tijdens de zondagse borrel.

## Language

**Bibliotheek**:
De volledige verzameling familiefoto's, opgeslagen als mappenboom in OneDrive (jaar → maand → gebeurtenis). De bron van waarheid voor de app. De hoofdmap wordt niet hardcoded maar in de app zelf gekozen na het koppelen van het OneDrive-account; daarbinnen volgt de app alleen die tak (folder-scoped delta).
_Avoid_: Album, collectie

**Gebeurtenis**:
Een map op het diepste niveau (onder jaar/maand) die één voorval bevat; de mapnaam dient als titel.
_Avoid_: Event, album, map

**Beschrijving**:
De per-foto tekst die de vader in het OneDrive-beschrijvingsveld (`driveItem.description`) vastlegt — zelf getypt óf een AI-suggestie die hij goedkeurt (zie de **Beheer-webapp**). Blijft "zijn" tekst: niets landt zonder goedkeuring. Optioneel — niet elke foto heeft er een.
_Avoid_: Caption, bijschrift

**Locatie**:
De geografische plek waar een **Foto** is gemaakt, als GPS-coördinaten (lat/lon). Bron van waarheid is de **EXIF GPS-IFD** in het bestand; de apps lezen het uitsluitend via het afgeleide Graph `location`-facet (`PhotoParser`, `item.location`), nooit los uit EXIF. Optioneel — niet elke foto heeft een Locatie (~34% wél; zie `docs/research/gps-coverage.md`). Wordt toegekend op **Gebeurtenis**-niveau (één punt voor de hele map als default), met afwijking per **Foto** mogelijk.
_Avoid_: GPS, geotag, plaats

**Fotoshow**:
De schermvullende slideshow op de TV met onderschrift in beeld. Primair een gewone app die je handmatig opent; daarnaast óók als screensaver (DreamService) aangeboden, selecteerbaar waar het kastje dat toelaat. Zie ADR-0003.
_Avoid_: Screensaver, diashow

**Onderschrift**:
Het tekstblok over de foto. Twee delen: een **Kop** (altijd) en een **Beschrijving** (optioneel).
_Avoid_: Titel (te dubbelzinnig — gebruik Kop)

**Kop**:
De eerste regel van het onderschrift: gebeurtenis-naam + jaar (bijv. "Bruiloft Anne & Tom · 2019"). Altijd aanwezig. Het jaar komt uit de **jaar-map**, niet uit de EXIF-opnamedatum (die is onbetrouwbaar bij ingescande foto's). EXIF alleen als terugval.

**Hoofdmap**:
De map binnen de **Bibliotheek** die de gebruiker na het koppelen kiest als startpunt; de app indexeert en toont uitsluitend díe tak (folder-scoped delta). Wordt gekozen via de **map-kiezer** (`engine.FolderPicker`, die door de OneDrive-mappenboom laat bladeren) en bewaard in de `TokenStore`. Eén tegelijk; een andere kiezen herindexeert de oude niet (index per map).
_Avoid_: Root, startmap

**Beheer-webapp**:
De webapp (in `web/`, TanStack Start op Cloudflare) waarmee de vader zijn **Bibliotheek** cureert: interactief door foto's lopen die nog een **Beschrijving** of **Locatie** missen, AI-suggesties goedkeuren/overslaan, en handmatig bijsturen via een kaart. Kan ook scheef-staande foto's lossless rechtzetten via de EXIF-Orientation-vlag (geen pixel-re-encode). Schrijft terug naar OneDrive (Beschrijving via Graph-`PATCH`; Locatie + Oriëntatie via één EXIF-re-upload van het JPEG). Apart van de **Fotoshow** (de TV-app), maar op dezelfde **Bibliotheek**.
_Avoid_: Companion-app, admin-app

## Relationships

- De **Bibliotheek** ordent **Gebeurtenissen** per jaar en maand
- Een **Gebeurtenis** bevat meerdere **Foto's**
- Een **Foto** heeft optioneel één **Beschrijving**
- Een **Foto** heeft optioneel één **Locatie**; de default komt van de **Gebeurtenis**
- Het **Onderschrift** van een **Foto** = **Kop** (gebeurtenis + jaar) + optioneel de **Beschrijving**

## Observability

De app meldt fouten en de duur van de zware operaties (`index.crawl`, `index.delta`, login, Graph-calls)
aan **Sentry**, geïnitialiseerd in `ThrowbackApp`. Alle Sentry-aanroepen lopen via de `Telemetry`-façade.
Privacy-bewust: géén Session Replay (privé-familiefoto's), geen PII, en SAS-tokens worden uit
breadcrumb-URL's gestript. Zie ADR-0007.
