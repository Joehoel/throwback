# De eerste-foto's-handshake blijft in de coordinator, niet als aparte module

Bij het opstarten (en na een mapwissel of retry) moet de app wachten tot de achtergrond-index zijn
eerste foto's heeft en dán pas de **Fotoshow** starten — vanaf welk wachtscherm we ook staan
(synchroon `Nav.Booting` om de connect-flits te vermijden, of de **map-kiezer** in `preparing`). Die
logica is overwogen als kandidaat om naar een eigen module te tillen (een "ShowStarter").

Besluit: **de handshake blijft in `MainViewModel`.** Het is in essentie *navigatie-overgang*
(`Booting`/`PickingFolder` → `Showing`), en dat is precies wat de coordinator hoort te bezitten —
dezelfde scheiding als waarom `UiState`/`Nav`-overgangen daar geconcentreerd zitten. Een aparte
`ShowStarter` zou dezelfde afhankelijkheden nodig hebben (navFlow, slideshow, sync, db, picker,
store) en de overgangen over twee plekken verdelen: slechtere locality, en een ondiepe naad
(interface even complex als de implementatie). De deletion-test bevestigt het: zo'n module schrappen
verplaatst de complexiteit terug naar de VM zónder die ergens te concentreren — het teken van een
pass-through.

De "verspreidheid" over meerdere methodes was grotendeels **defensief**: één centrale wachter i.p.v.
een `await` binnen `startShow` voorkomt dat een mapwissel/retry meerdere gesuspendeerde wachters
achterlaat die met de verkeerde **Hoofdmap** zouden starten.

## Wat wél is aangepast (geen module)

De altijd-aan `sync.state`-collector + `startShowFromIndex` zijn vervangen door één benoemd,
cancelbaar wachtpunt `awaitFirstPhotosThenStart()`:

- het cancelt eerst de vorige wachter, dus er draait er hooguit één (behoudt de defensieve eigenschap);
- `sync.state.first { it.indexed > 0 }` vuurt precies één keer, wat een latente **dubbel-start**
  wegneemt (de oude collector vuurde op elke emissie, en twee snelle emissies konden vóór het zetten
  van `hasPlaylist`/`Showing` beide `slideshow.start` aanroepen);
- de handshake staat nu als één begrip op één plek i.p.v. uitgesmeerd over `init`-collector +
  `isAwaitingFirstPhotos` + `startShowFromIndex`.

## Consequences

- `MainViewModel` is niet als unit-test afgedekt (extends `AndroidViewModel`, leest de echte
  `AppContainer` met Room/Session/OkHttp). De handshake wordt daarom handmatig op het toestel
  geverifieerd, niet via een test. Dit is een bewuste afweging: een testbare naad zou hier een
  ondiepe module forceren die de architectuur niet verdient.
- Toekomstige architectuur-reviews hoeven de "trek de show-start uit de coordinator"-suggestie niet
  opnieuw op te werpen.
