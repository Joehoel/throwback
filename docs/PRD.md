# PRD — Throwback

Een Android TV-app die de familiefotobibliotheek uit OneDrive als schermvullende slideshow toont, met de gebeurtenis en het jaar in beeld. Bedoeld voor de zondagse borrel op de Google TV.

> Domeintaal staat in [CONTEXT.md](./CONTEXT.md). De dragende beslissingen in [docs/adr/](./adr/).

## Probleem

De familie heeft tienduizenden foto's, gecureerd met titels en jaartallen. De screensaver van Google TV toont die metadata niet. Google Photos zit sinds maart 2025 op slot voor apps. OneDrive bevat dezelfde foto's én is wél leesbaar.

## Gebruiker & gebruik

- **Kijkers:** de familie, tijdens de borrel. Bediening met de afstandsbediening.
- **Beheerder:** de vader. Hij voegt gebeurtenissen (mappen) en beschrijvingen toe in OneDrive.
- **Gebruik:** app openen op het kastje → schermvullende shuffle-slideshow als rustige achtergrond bij eigen muziek.

## Scope v1

**Wel:**
- OneDrive koppelen in de app + hoofdmap kiezen.
- Foto's als schermvullende slideshow, geshuffeld door de hele bibliotheek.
- Alle gangbare afbeeldingsformaten (HEIC, JPG, PNG, …) — opgelost via Graph-thumbnails (JPEG).
- Onderschrift: gebeurtenis + jaar (altijd), beschrijving (indien aanwezig).
- Vooruit/terug met de afstandsbediening, zonder hapering.
- Nieuwe foto's van de vader verschijnen vanzelf.

**Niet (later):**
- Video's.
- Instelbaar tempo en volgorde (v1 = vaste standaard).
- Jaar-/periodefilter.
- Werkende screensaver-modus afdwingen (wel aangeboden waar het kastje 't toelaat).

## Hoe het werkt

De afgesproken vorm, kort:

- **OneDrive is de bron van waarheid** (ADR-0001), persoonlijk account (ADR-0002).
- **Lokale index (Room)** als bron voor de show, gevuld via **Graph delta-sync**, beelden via **Coil-cache** (ADR-0004).
- **Primair een gewone app**; óók als `DreamService` geregistreerd (ADR-0003).
- **Jaar uit de mapnaam**, niet uit EXIF (onbetrouwbaar bij scans).
- **Hoofdmap in de app gekozen**, niet hardcoded; delta beperkt tot die map.

<details>
<summary>Tech stack</summary>

- **Taal/UI:** Kotlin + Jetpack Compose (TV).
- **Auth:** MSAL, OAuth device-code flow, scope `Files.Read` (delegated, persoonlijk account).
- **Data:** Microsoft Graph `/drives/{drive-id}/items/{map-id}/delta`, `$select` op alleen benodigde velden.
- **Index:** Room (SQLite). Tabellen `Photo` + `SyncState(deltaLink, lastSync)`.
- **Beeld:** Coil 3, geheugen- + schijfcache met harde `maxSizeBytes`. TV-formaat thumbnails (~1920px).
- **Afspeellijst:** in-memory geschudde `LongArray` van foto-id's + `currentIndex`, prefetch-venster.
- **Distributie:** APK, sideload via ADB (`adb connect` + `adb install`). Geen Play Store.
</details>

## Bouwfasen

### Fase 0 — Verificatie-spike ✅ AFGEROND (2026-05-29)

Bevestigd dat het `description`-veld via Graph terugkomt voordat we erop bouwen.

- ✅ Azure app-registratie (persoonlijk account, "Personal Microsoft accounts only", public client flows, `Files.Read`).
- ✅ Device-code login tegen een persoonlijk account.
- ✅ Testfoto via Graph: beschrijving "Hallo Wereld" kwam exact terug in `description`.

**Resultaat:** geslaagd. De plumbing werkt end-to-end (zie `scripts/verify_description.py`). Bijvangst: de bibliotheek bevat gemengde formaten (HEIC, JPG, PNG, …) — we tonen Graph-thumbnails (altijd JPEG), zodat álle formaten uniform werken zonder decoder op het kastje.

### Fase 1 — Koppelen & map kiezen ✅ AFGEROND (2026-05-29)

- ✅ Android TV-projectskelet (Kotlin/Compose, draait op de emulator).
- ✅ "OneDrive koppelen"-scherm met device-code flow (zie ADR-0005).
- ✅ Mappen-browser: door de OneDrive-boom bladeren en de hoofdmap kiezen.
- ✅ Gekozen map + refresh-token bewaard (app-privé `SharedPreferences`; versleutelen = open punt).

**Resultaat:** geslaagd op de emulator — inloggen, mappen bladeren en een hoofdmap kiezen werkt. Code: `app/.../onedrive/` + `ui/ConnectFlow.kt` + `MainViewModel.kt`. Les: `tv-foundation` botst met de huidige Compose-BOM → lijsten met de gewone `LazyColumn` (bevestigt ADR-0004).

### Fase 2 — Index & sync ✅ AFGEROND (2026-05-29)

- ✅ Lokale SQLite-index (`PhotoDb`), gevuld via een recursieve **`children`-crawl** (niet delta — die geeft `description` niet terug; zie ADR-0004 update).
- ✅ Per map → gebeurtenis + jaar (jaar-map leidend); `description` → beschrijving.
- ✅ Throttling (429/503) met `Retry-After`.
- ✅ Getest: `PhotoParser` + `GraphCrawler` met unit-tests (`gradlew test`, ~1s); recursie + parsing zonder netwerk.

**Resultaat:** end-to-end bewezen op de emulator + geverifieerd uit de index op het apparaat: 186 foto's geïndexeerd, de beschreven foto ("Hallo Wereld") kwam correct mee.

**Later (open):** incrementeel verversen via delta + per-item `description` bijhalen (nu: volledige crawl per keer).

### Fase 3 — De slideshow ✅ AFGEROND (2026-05-29)

- ✅ Geschudde afspeellijst (`Playlist`, unit-getest) uit de index.
- ✅ Coil laadt TV-thumbnails (JPEG, alle formaten).
- ✅ Schermvullend + **crossfade** (~1,5s) + **wazig-gevulde achtergrond** (Google-screensaver-look), ±8s per foto.
- ✅ Onderschrift: Kop (gebeurtenis + jaar) + optionele beschrijving.
- ✅ Afstandsbediening: vooruit/terug/pauze (D-pad).

**Resultaat:** werkende fotoshow op de emulator, visueel bevestigd. Code: `player/Playlist.kt`, `ui/ConnectFlow.kt` (SlideshowScreen), `onedrive/GraphMedia.kt`.

**Nog te polijsten:** prefetch van buren (nu load-on-demand; de crossfade maskeert het grotendeels) voor écht hapering-vrij vooruit/terug.

### Fase 4 — Polish & instellingen ✅ GROTENDEELS AFGEROND (2026-05-29)

- ✅ Instellingen: **tempo** + **volgorde** (shuffle/chronologisch, `PhotoOrder` unit-getest); andere map via "opnieuw koppelen".
- ✅ **Robuuste foutafhandeling**: netwerkfout → wifi-melding (`Errors`, unit-getest); verlopen token → re-auth-pad (`ReauthRequired` → opnieuw inloggen, map/index blijven); losse mislukte thumbnail → show gaat door.
- ✅ **Prefetch**: stabiele thumbnail-URL per foto + buren vooraf in Coil's cache → vlot vooruit/terug.
- ✅ App geregistreerd als **`DreamService`** (screensaver) — compileert/geregistreerd; selecteerbaarheid moet op het échte kastje getest worden (ADR-0003).

**Open (optioneel):** instelbare **cache-grootte** (Coil schijfcache-limiet); chronologische volgorde fijner maken; DreamService-selectie op het kastje verifiëren.

## Risico's & mitigaties

| Risico | Mitigatie |
|---|---|
| Beschrijving zit niet in Graph `description` | Fase 0-spike vóór alles |
| Trage eerste crawl bij tienduizenden | Streamend indexeren; afspelen start direct |
| Kortlevende thumbnail-URL's | Niet opslaan; vlak vóór weergave verversen |
| Throttling door Graph | `Retry-After` respecteren, delta i.p.v. pollen |
| Screensaver niet selecteerbaar op Google TV | App is primair handmatig te openen (ADR-0003) |

## Open punten (later beslissen)

- Exacte cache-grootte (standaard voorstel: ~1 GB).
- Of de beschrijvingen die alleen in Google Photos staan eenmalig naar OneDrive moeten (ADR-0001).
- Video-ondersteuning (gedempt, met tijdslimiet).
