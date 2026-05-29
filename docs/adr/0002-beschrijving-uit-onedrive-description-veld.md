# Beschrijving komt uit het OneDrive `description`-veld

De tweede regel van het onderschrift (de **Beschrijving**) leest het `driveItem.description`-veld via Microsoft Graph. Overwogen alternatieven: EXIF/IPTC in het bestand, en de Google Takeout-JSON. Gekozen voor het OneDrive-veld omdat dat is waar de vader de tekst typt en het zonder export of bestandsbewerking live leesbaar is.

Belangrijke beperking: `driveItem.description` is alleen read-write op **OneDrive Personal**. De bibliotheek staat op een persoonlijk account, dus dit werkt — maar het ontwerp is hieraan gekoppeld. Een overstap naar een werk/school-account zou deze keuze breken.

## Status

**Geverifieerd (2026-05-29).** Spike `spike/verify_description.py`: een in de OneDrive-UI getypte beschrijving ("Hallo Wereld") kwam exact terug in `driveItem.description` via Graph. De plumbing (registratie, device-login, Graph, beschrijving lezen) werkt end-to-end.

## Consequences

- De bibliotheek bevat gemengde formaten (HEIC, JPG, PNG, …) en de app moet ze allemaal tonen. Graph levert thumbnails altijd als JPEG, ongeacht het bronformaat — door thumbnails te tonen ondersteunen we élk formaat uniform, zonder per type een decoder op het kastje.
- Resterende check (klein): bevestigen dat de vader zijn beschrijvingen via hetzelfde OneDrive-veld invult wanneer hij op zijn eigen account cureert.
