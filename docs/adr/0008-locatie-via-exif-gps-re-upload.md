# Locatie schrijven via EXIF GPS-re-upload, niet via Graph

De **Beheer-webapp** voegt ontbrekende **Locatie** toe door lat/lon in de **EXIF GPS-IFD** van het bestand te schrijven en het bestand opnieuw te uploaden — terwijl **Beschrijving** via een goedkope Graph-`PATCH /me/drive/items/{id}` met `{"description": …}` gaat (ADR-0002). De reden voor het verschil: het Graph `location`-facet waaruit beide apps locatie lezen (`PhotoParser`, `item.location`) is **afgeleid en read-only** — het weerspiegelt de EXIF GPS in het bestand en is niet los te zetten. Coördinaten landen dus alleen als ze in het bestand zelf staan.

## Considered Options

- **Path A — `PATCH driveItem.location`** (analoog aan de beschrijving): verworpen, het `location`-facet is niet schrijfbaar via Graph; het wordt door OneDrive uit de bestands-EXIF afgeleid.
- **Path B — EXIF GPS-IFD + re-upload** (gekozen): vult na re-upload het `location`-facet, zo sluit nieuwe locatie naadloos aan op de ~6.785 foto's die al écht GPS hebben (`docs/research/gps-coverage.md`).
- **Coördinaten alleen in eigen D1-store**: verworpen, dan ziet de TV-app (**Fotoshow**) de locatie nooit zonder een nieuwe web↔TV-koppeling.

## Consequences

- **Botst op het randje met ADR-0001** (OneDrive = bron van waarheid, originelen ongemoeid). Verzacht door **lossless-only**: alleen formaten waar de EXIF-tag zonder her-encoderen geïnjecteerd kan worden. JPEG kan dit (bytes injecteren, beeld identiek); HEIC alleen als een in-place route blijkt te werken; PNG kent geen standaard EXIF-GPS en valt vrijwel zeker af. Niets dat een origineel degradeert.
- Re-upload **bumpt de modified-timestamp** → de TV-app her-crawlt het item (gewenst: zo bereikt de locatie de Fotoshow).
- **Oriëntatie** (lossless EXIF-Orientation-vlag) is ook een EXIF-tag en reist mee in **dezelfde** download→injecteer→re-upload-pass per bestand — één zware operatie dekt Locatie + rotatie.
- Granulariteit: de suggestie is op **Gebeurtenis**-niveau (één punt per map), per **Foto** te overschrijven; bij goedkeuring wordt dat punt in elk no-GPS-bestand van de map geschreven.

## Status

**Geverifieerd voor JPEG (2026-06-05)** — spike `scripts/verify_location_write.py`, tegen het echte account op het nieuwe `!s…`-backend:
- Een lossless geïnjecteerde EXIF GPS-coördinaat (piexif, alleen het EXIF-segment) rondt na re-upload volledig door via het Graph `location`-facet — zowel direct als via de **children-crawl** die de TV-app-indexer leest. (Graph extraheert async: ~6–9 s vertraging.)
- De Graph-thumbnail **honoreert** een gewijzigde EXIF-Orientation (large-afmetingen klapten om 800×285 → 285×800), dus lossless rechtzetten is zichtbaar in de **Fotoshow**.
- Locatie + Oriëntatie reizen in één re-upload mee; het origineel is byte-identiek terug te zetten.

**Nog open:** HEIC en PNG — niet getest (piexif is JPEG/TIFF; PNG kent geen standaard EXIF GPS-IFD). Blijven buiten v1 tenzij een lossless in-place EXIF-route blijkt te bestaan; v1 schrijft locatie/oriëntatie dus alleen naar JPEG, andere formaten worden in de lus overgeslagen voor locatie (Beschrijving blijft voor alle formaten via `PATCH`).
