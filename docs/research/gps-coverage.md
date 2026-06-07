# Research: ontbrekende GPS/locatie in de index

Status: **onderzoek afgerond** · Datum: 2026-06-05

## Aanleiding

Van de ~19.967 geïndexeerde foto's hebben er **6.783 een locatie** (~34%). De vraag was of de
rest een *bug* is (app/OneDrive die GPS kwijtraakt) of dat die foto's simpelweg nooit GPS hadden.
Een onafhankelijke script-telling op de bestand-backup kwam op **6.785** met GPS — vrijwel exact
hetzelfde getal als de app.

## Korte conclusie

**Er gaat geen GPS verloren door de app of OneDrive.** Elke ontbrekende locatie is te verklaren aan
de *opnamekant*. De app leest GPS uitsluitend uit OneDrive's `location`-facet
(`PhotoParser.kt`, `item.location.{latitude,longitude}`) — nooit uit EXIF — en die facet weerspiegelt
trouw wat in het bestand zit (gecontroleerd: 5/5 controlefoto's met GPS hadden facet én EXIF).

De GPS-dekking volgt een **toestelgeschiedenis-curve** (pre-2009 ≈0%, oplopend naar 90%+ vanaf 2019),
niet het patroon van een bug.

## Was er ooit méér? (de verlies-vraag)

Nee, voor zover lokaal te toetsen. DB-snapshots van 2 juni 2026 vs. het toestel op 5 juni 2026 tonen
**identieke** GPS-tellingen per jaar (2009: 61→61, 2010: 1→1, 2011: 42→42). Oude reizen (Israël 2016,
2022, 2023, 2024) hebben gewoon hun GPS. Er is geen snapshot van vóór die periode, maar de drie
onafhankelijke signalen — bestandstelling = app-telling = stabiele curve — wijzen alle dezelfde kant op.

Relevante bug (al gefixt, commit `80463eb`): de oude `updateKeepingPlace` overschreef `lat`/`lon` met
null bij een her-crawl. Nu `COALESCE(:lat, lat)` → een lege crawl kan vastgelegde coördinaten niet meer
wissen. Deze klasse van verlies kan niet meer optreden.

## Waarom foto's zonder locatie er zonder zitten

Alle **3.465** null-GPS foto's die in een *gemengde map* staan (map met óók wél-GPS foto's) zijn
nagelopen op cameramodel (Graph `photo`-facet) en per categorie byte-niveau gecontroleerd
(EXIF GPS-IFD aan-/afwezig). Vier oorzaken, allemaal aan de opnamekant:

| categorie | aantal | reden |
|---|---|---|
| Camera zonder GPS-chip | 1.547 | Canon EOS 1200D, Samsung WB750, Olympus, Pentax K-m, PowerShot — geen GPS-hardware |
| Geen EXIF (gedeeld/screenshot/scan) | 721 | doorgestuurde/verkleinde kopie (WhatsApp ~2048px stript EXIF+GPS) |
| HTC 7 Pro (Windows Phone 7) | 455 | oude WP7, locatie uit/onbetrouwbaar (byte-check: geen GPS-blok) |
| Telefoon met locatie uit bij opname | 742 | iPhone 14 Pro / Nokia Lumia; byte-check: volledige EXIF, géén GPS-blok |

### Belangrijke valkuilen bij interpretatie

- **`IMG_*.JPG` is geen één toestel.** Het zijn Canon-spiegelreflexen (geen GPS, vooral oude jaren)
  én iPhones (wél GPS, recente jaren) door elkaar. Daardoor springt de IMG_-GPS-rate per jaar
  (2013: 85% → 2015: 0% → 2018: 93%) — dat is camerawissel, geen verlies.
- **"Zelfde reis, sommige wél/sommige niet" = meerdere toestellen.** Praag 2025: een **iPhone 13**
  (locatie aan → 57 foto's mét GPS) en een **iPhone 14 Pro** (locatie die reis uit → 55 zonder, maar
  volledige 4032×3024 EXIF zonder GPS-blok). Diezelfde iPhone 14 Pro geotagt elders wél, dus het was
  een instelling die reis (roaming/vliegtuigstand), geen kwijtgeraakte data.
- **Geen GPS-blok in een volledig EXIF-bestand = locatie stond uit bij opname**, niet gestript.
  (Een afgekapte stub met alleen `GPSVersionID` zou "aan maar geen fix" betekenen.)

## Methode (reproduceerbaar)

- DB van toestel: `adb -s <ip>:5555 shell run-as fyi.kuijper.throwback cat databases/throwback.db`
  (app eerst `am force-stop`, daarna WAL-checkpoint).
- Token: `refresh_token` uit `shared_prefs/throwback_onedrive.xml`, verzilveren bij
  `login.microsoftonline.com/consumers/oauth2/v2.0/token` (client `0bb9b8c8-…`, scope `Files.Read offline_access`).
- Cameramodel/locatie: Graph `GET /me/drive/items/{id}?$select=name,location,photo` (batchen via `/$batch`, 20/req, 429-backoff).
- Byte-niveau EXIF: `GET …/items/{id}/content` — redirect handmatig volgen **zonder** auth-header
  (de download-URL is pre-signed; meesturen geeft 401). Daarna `Image.getexif().get_ifd(0x8825)` voor het GPS-IFD.
- De `location`-facet en de EXIF zijn voor deze items consistent leeg; OneDrive's ongedocumenteerde
  `_api/v2.1` is niet nodig gebleken — het cameramodel was telkens beslissend.
