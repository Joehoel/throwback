# Research: browser-, OneDrive- en Worker-beperkingen voor JPEG-writes

Status: **onderzoek afgerond** · Datum: 2026-09-11 · Issue:
[#25](https://github.com/Joehoel/throwback/issues/25)

## Besluit in één alinea

Er zijn **twee verschillende, haalbare paden**, maar geen enkel universeel direct bestandspad.
Op Windows en macOS kan Chromium (Edge/Chrome) na expliciete maptoestemming echte JPEG's in een
lokaal gesynchroniseerde OneDrive-map lezen en overschrijven; de OneDrive-client hydrateert en
synct de bestanden. Dat bevestigt het lokale pad uit [ADR-0019](../adr/0019-bestandsmetadata-als-bron-van-waarheid.md),
maar alleen als **desktop-Chromium + lokale OneDrive-sync** bewust een productvoorwaarde blijft.
Safari op iPhone én Mac heeft geen picker voor schrijfbare externe bestanden of mappen; Safari 26
kan alleen naar het origin-private bestandssysteem (OPFS) schrijven. Cureren vanaf iPhone, Safari
of een apparaat zonder lokale sync vereist daarom **delegated Microsoft Graph download → wijziging
van de JPEG → volledige upload**. Als die write tabsluiting, iOS-suspensie, tokenverversing en Graph
throttling moet overleven, hoort de uitvoering niet in de browser of een gewone HTTP-Worker maar in
een durable serverproces zoals Cloudflare Workflows.

## Platformmatrix

| Platform | Echte JPEG lezen | Hetzelfde externe bestand overschrijven | Betrouwbaar na sluiten/suspensie | Architectuurgevolg |
|---|---|---|---|---|
| Windows Edge/Chrome | Ja, via `showDirectoryPicker()`/file handle; online-only OneDrive-bestanden worden bij openen door de sync-client gedownload | Ja, na `readwrite`-toestemming via `createWritable()` | Nee voor browserwerk; de lokale write zelf is bij `close()` gecommit en OneDrive-sync loopt buiten de webapp | **Lokaal-direct haalbaar** |
| macOS Chrome/Edge | Zelfde Chromium-API; OneDrive Files On-Demand hydrateert bij openen | Ja, na toestemming | Zelfde beperking | **Lokaal-direct haalbaar** |
| macOS Safari / Safari-webapp in Dock | Geselecteerde bestanden zijn leesbaar; OPFS is lees/schrijfbaar | **Nee voor een bestaand extern bestand of gekozen map.** Geen `showOpenFilePicker`, `showSaveFilePicker` of `showDirectoryPicker` zoals Chromium | Nee | **Graph-pad vereist** |
| iPhone Safari / geïnstalleerde webapp | Losse bestanden en vanaf Safari 18.4 een directory kunnen via HTML-selectie worden ingelezen; dat levert geen extern schrijfhandle op | **Nee.** Safari 26's writable stream schrijft naar OPFS, niet terug naar de gekozen JPEG | **Nee.** WebKit heeft Background Sync (`SyncManager`) nog niet geïmplementeerd | **Graph-pad; voor duurzame write server-side** |
| Geïnstalleerde Chromium-PWA op desktop | Zelfde File System Access API; file handlers kunnen een geïnstalleerde app voor ondersteunde bestandstypen starten | Ja, met per gebruiker verleende toegang | Installatie maakt browserwerk niet durable, maar bestandsmachtigingen kunnen wel persistent zijn | **Handiger lokaal pad, geen nieuw platformpad** |

Bronnen: [Chrome File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access),
[Chrome persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api),
[Chrome PWA file handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling),
[Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
[WebKit-implementatie van `FileSystemWritableFileStream`](https://github.com/WebKit/WebKit/pull/37266),
[WebKit OPFS-uitleg](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/),
[Safari 18.4 directory upload](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) en
[open WebKit-verzoek voor Background Sync](https://bugs.webkit.org/show_bug.cgi?id=182565).

### Wat File System Access wel en niet garandeert

- De Chromium-pickers vereisen HTTPS, een gebruikersactie en expliciete gebruikerstoestemming.
  Een directoryhandle kan recursief worden gebruikt en met `{ mode: "readwrite" }` schrijfbaar
  worden aangevraagd.
- Handles zijn serialiseerbaar naar IndexedDB, maar een opgeslagen handle is niet automatisch een
  blijvende machtiging. De app moet `queryPermission()`/`requestPermission()` gebruiken. Sinds
  Chrome 122 kan een gebruiker toegang voor volgende bezoeken bewaren; voor geïnstalleerde apps
  wordt verleende toegang standaard bewaard.
- `createWritable()` schrijft via een tijdelijke stream; de wijziging bereikt het bestand pas bij
  `close()`. Een verse `getFile()` is nodig als het bestand ondertussen op schijf veranderde.
- Een geïnstalleerde desktop-PWA kan als file handler voor bijvoorbeeld `.jpg` worden geregistreerd,
  maar installatie verleent niet stilzwijgend toegang tot een hele fotobibliotheek en maakt de app
  niet tot een betrouwbaar achtergrondproces.
- OPFS is browseropslag per origin. De bestanden hoeven niet één-op-één als zichtbare bestanden op
  schijf te bestaan. Safari's writable stream maakt daarom geen lokale OneDrive-write mogelijk.

### OneDrive Files On-Demand

Op [Windows](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-windows-0e6860d3-d9f3-4971-b321-7092438fb38e)
en [macOS](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-mac-529f6d53-e572-4922-a585-e7a318c135f0)
staan online-only items wel in de lokale mappenboom. Openen downloadt het item; wijzigingen binnen
de OneDrive-map worden door de desktopclient weer gesynchroniseerd. Daardoor hoeft de webapp in het
lokale Chromium-pad Graph niet te kennen. Het pad is echter afhankelijk van de geïnstalleerde en
ingelogde OneDrive-client, voldoende lokale ruimte en voltooide sync; het is geen browserfunctie en
bestaat niet op iPhone als een schrijfbare gesynchroniseerde map.

## Microsoft-identiteit: altijd namens de gebruiker

Voor OneDrive Personal kan een daemon geen app-only machtiging van de eigenaar krijgen: persoonlijke
Microsoft-accounts ondersteunen geen app-only toegang. Het cross-platform pad moet dus met een
**delegated token** namens de ingelogde gebruiker werken. `Files.ReadWrite` is de minst ruime
gedocumenteerde delegated scope voor lezen en vervangen van bestanden van de gebruiker en werkt voor
persoonlijke accounts. `Files.ReadWrite.Selected` is volgens de OneDrive-documentatie niet bedoeld
om direct via Microsoft Graph aan te vragen.

Voor een browser-SPA geldt:

- gebruik authorization code flow met PKCE; een SPA mag geen client secret bevatten;
- vraag `offline_access` wanneer een refresh token nodig is;
- refresh tokens die zijn uitgegeven aan een als `spa` geregistreerde redirect-URI verlopen na
  **24 uur**; een nieuwe top-level authorization is daarna nodig;
- blokkeren van third-party cookies verhindert hidden-iframe silent SSO. Microsoft noemt Safari
  expliciet; interactie via top-level navigatie of popup blijft mogelijk.

Een Workflow kan dus niet zelfstandig app-only toegang tot de persoonlijke Bibliotheek verkrijgen.
Voor losgekoppelde uitvoering moet de server een eerder verleende delegated grant en refresh token
veilig bewaren/verversen. Een uitsluitend in de iPhone-SPA bewaard token is geen basis voor
onbeheerde uitvoering over meerdere dagen.

Bronnen: [Microsoft: SPA's en third-party cookies](https://learn.microsoft.com/en-us/entra/identity-platform/reference-third-party-cookies-spas),
[authorization code flow + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[refresh-tokenlevensduur](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens),
[app-only en persoonlijke accounts](https://learn.microsoft.com/en-us/entra/identity-platform/app-only-access-primer) en
[OneDrive-permissions](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference?view=odsp-graph-online).

## Graph-download: bytes zijn beschikbaar, maar let op de redirect

`GET .../content` antwoordt met een `302` naar een vooraf geauthenticeerde download-URL. Browsercode
kan de Graph-call door CORS doen, maar Microsoft waarschuwt dat `/content` vanuit JavaScript niet
direct bruikbaar is wanneer de `Authorization`-header op de redirect terechtkomt. De browserroute is:
vraag de DriveItem-property `@microsoft.graph.downloadUrl` op en fetch die tijdelijke URL **zonder**
Authorization. De URL is kortlevend, mag niet worden gecachet als duurzame locator en ondersteunt
`Range`-requests.

Dit levert een echte JPEG-stream op. Een wijziging van embedded EXIF/XMP is bij Graph echter geen
metadata-`PATCH`: de gewijzigde binaire inhoud moet als een volledig nieuw contentstream worden
teruggezet. Upload-sessionfragmenten maken de overdracht hervatbaar, maar veranderen die volledige
bestandsvervanging niet.

Bronnen: [Graph download content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
en [OneDrive CORS](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors?view=odsp-graph-online).

## Graph-upload: simpel versus hervatbaar

| Eigenschap | `PUT .../content` | Upload session |
|---|---|---|
| Effect | Maakt bestand of vervangt volledige content | Maakt/vervangt volledige content na alle ranges |
| Grootte | Maximaal **250 MB** | Tot de OneDrive-maximumgrootte van **250 GB per bestand** |
| Overdracht | Eén request; opnieuw beginnen na onderbreking | Hervatbaar via `nextExpectedRanges` tot `expirationDateTime` |
| Fragmenten | Niet van toepassing | Sequentieel; elk fragment **kleiner dan 60 MiB**; fragmentgrootte (behalve laatste) veelvoud van **320 KiB**; totale grootte vooraf bekend |
| Auth | Bearer token op Graph-request | Bearer alleen bij sessiecreatie; de preauthenticated `uploadUrl` krijgt **geen** `Authorization`-header |
| Versievoorwaarde | De huidige endpointdocumentatie noemt alleen `Authorization` en `Content-Type`; `If-Match` is hier niet gedocumenteerd | `If-Match: <eTag of cTag>` bij sessiecreatie geeft `412 Precondition Failed` bij mismatch |
| Gebruik | Alleen als één niet-hervatbare write acceptabel is | Microsoft adviseert resumable vanaf **10 MiB**; 5–10 MiB fragments aanbevolen |

Bronnen: [Graph simple upload](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0)
[Graph upload sessions](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
en [OneDrive-bestandsgroottelimieten](https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa).

### Versies en conflicten

Een DriveItem heeft twee relevante validators:

- `eTag` verandert wanneer metadata **of** content verandert;
- `cTag` verandert wanneer content verandert, maar niet bij een metadata-only wijziging.

Voor een read-modify-write van JPEG-bytes is een vastgelegde validator noodzakelijk om een inmiddels
gewijzigd origineel niet stil te overschrijven. Upload sessions hebben daarvoor de gedocumenteerde
`If-Match`-voorwaarde bij sessiecreatie. Dit is geen lock: de documentatie belooft de check bij het
maken van de sessie, niet dat het item gedurende de hele upload geblokkeerd blijft. Voor simple upload
kan op basis van de gepubliceerde endpointdocumentatie geen veilige `If-Match`-garantie worden
aangenomen. “Onder 250 MB” is dus op zichzelf geen reden om simple upload voor een concurrerende
read-modify-write te kiezen.

Bron: [Graph DriveItem (`eTag`/`cTag`)](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0).

Graph kan verzoeken met `429 Too Many Requests` weigeren. De client moet de `Retry-After`-waarde
respecteren; direct agressief herhalen vergroot de throttling. Dit maakt een batch van fotowrites
extra ongeschikt voor een kortlevende browser- of requestcontext.

Bron: [Microsoft Graph throttling](https://learn.microsoft.com/en-us/graph/throttling).

## Cloudflare Workers: streaming helpt, maar heft limieten niet op

Relevante platformgrenzen:

| Grens | Waarde | Betekenis voor JPEG's |
|---|---:|---|
| Geheugen | **128 MB per isolate**, gedeeld door gelijktijdige requests | `arrayBuffer()` van grote download plus gewijzigde kopie kan de limiet ruim vóór 128 MB bestandsgrootte raken |
| Inkomende request body | Free/Pro **100 MB**, Business **200 MB**, Enterprise self-service tot **5 GB** | Geldt als browserbytes via de Worker worden geproxy'd; direct browser→Graph vermijdt deze ingressgrens |
| Response body | Geen afgedwongen limiet | Maakt buffering niet veilig; CDN-cachelimieten zijn afzonderlijk |
| CPU per betaald HTTP-request/Workflow-step | Standaard **30 s**, configureerbaar tot **5 min** | JPEG-parsing/mutatie telt als CPU; wachten op `fetch` niet |
| HTTP wall time | Geen harde limiet zolang client verbonden blijft | Geen duurzaamheid: na response/disconnect kan werk worden geannuleerd |
| `waitUntil()` | Tot **30 s** na response of disconnect | Niet geschikt voor langdurige upload, retry of polling |

[Cloudflare Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/) kunnen download-
en uploadbodies doorgeven zonder het hele bestand in het geheugen te zetten. Dat is noodzakelijk voor
grote bestanden, maar niet automatisch voldoende voor metadata-injectie: een codec die eerst de hele
JPEG naar `ArrayBuffer` kopieert blijft door de 128-MB-isolate begrensd. Een echt streamende
transformatie moet bovendien de uiteindelijke bestandsgrootte kunnen bepalen voordat het eerste
Graph upload-sessionfragment wordt verzonden.

Bron: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Betrouwbare achtergrondverwerking

Een browserupload is bruikbaar voor een expliciete foreground-actie, maar niet als de write moet
doorgaan nadat de gebruiker de tab of iPhone-webapp sluit. Installatie als PWA verandert dat niet;
op iOS ontbreekt zelfs Background Sync. Een gewone Worker-request is evenmin durable: verbinding en
`waitUntil()` zijn begrensde levenslijnen.

Cloudflare Workflows biedt wél durable stappen, retries en sleeps. Per stap is de wall time onbeperkt
(binnen de CPU-limiet), waardoor Graph `Retry-After`, uploadhervatting en asynchrone verwerking niet
aan een open browsertab hoeven te hangen. De binaire data zelf kent wel grenzen:

- event payload en niet-streamend step-resultaat: maximaal **1 MiB**;
- persistent state per instance: **100 MB Free**, **1 GB Paid**;
- een als step-resultaat geretourneerde `ReadableStream` telt ook mee in die instance-state;
- Cloudflare adviseert zeer grote of langlevende binaire artefacten extern, bijvoorbeeld in R2, te
  bewaren en alleen een referentie tussen stappen door te geven.

Workflows lost authenticatie, geheugen en eTag-races niet vanzelf op; het lost de levensduur en
retry-orkestratie op. Dat ondersteunt de richting van
[ADR-0011](../adr/0011-onedrive-writes-via-per-foto-workflows.md) voor het Graph-pad, ook al maakte
ADR-0019 die workflow overbodig voor het lokaal-directe pad.

Bronnen: [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
en [Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

## Haalbare paden en beslissingseffect

| Pad | Platforms | Technisch haalbaar | Doorslaggevende beperking |
|---|---|---|---|
| Lokale OneDrive-map → Chromium FSA → write → OneDrive sync | Windows/macOS Edge/Chrome, eventueel geïnstalleerd | **Ja** | Vereist desktop, lokale sync, maptoestemming en actieve OneDrive-client |
| Extern bestand → Safari FSA → in-place write | iPhone/macOS Safari, ook geïnstalleerd | **Nee** | Safari writable = OPFS; geen extern schrijfhandle |
| Browser → delegated Graph download/mutate/upload | Alle genoemde browsers | **Ja, foreground** | Volledige JPEG in browser, 24-uurs SPA refresh-tokenregime, tab/iOS-suspensie, retry en uploadstatus |
| Browser → Worker als één lange request → Graph | Alle browsers | **Voorwaardelijk, niet durable** | Clientverbinding/`waitUntil`, 128 MB en ingresslimiet |
| Browser start → durable Workflow → delegated Graph | Alle browsers | **Ja, durable** | Server moet delegated refresh grant bewaren; grote bytes streamen of extern opslaan; eTag/precondition bewaken |
| App-only Worker/Workflow → OneDrive Personal | Alle | **Nee** | Persoonlijke Microsoft-accounts verlenen geen app-only toegang |

### Concrete implicaties voor de bestaande ADR's

1. **ADR-0019 blijft correct als hoofdpad voor de vader op zijn laptop**, maar de productvoorwaarde
   moet expliciet “Edge/Chrome op Windows/macOS met lokaal gesynchroniseerde Bibliotheek” zijn, niet
   generiek “webapp” of “PWA”. Safari 26 verruimt die voorwaarde niet.
2. **Cross-platform of iPhone-curatie heractiveert het Graph-pad uit ADR-0011.** Dat is geen kleine
   browserfallback: het voegt delegated auth, volledige binaire transfer, versiecontrole,
   uploadhervatting en durable uitvoering opnieuw toe.
3. **Een PWA is verpakking, geen capability-escape.** Op desktop kan zij machtigingen/file handlers
   gebruiksvriendelijker maken; op iPhone krijgt zij geen schrijfbare OneDrive-map of gegarandeerde
   achtergrondupload.
4. **Gebruik voor een conflictgevoelige JPEG read-modify-write niet alleen bestandsgrootte als keuze
   tussen uploadvormen.** Alleen upload sessions documenteren hier een `If-Match`-precondition en zijn
   hervatbaar; hun waarde begint dus ook onder de simple-uploadlimiet van 250 MB.
5. **Houd de codec gescheiden van de IO-bron**, zoals ADR-0019 al voorschrijft. Dezelfde
   bytes→bytes-mutatie kan dan het lokale handle-pad en het Graph/Workflow-pad bedienen, terwijl hun
   platform-, auth- en duurzaamheidsvoorwaarden gescheiden blijven.

## Bronnen

Alle gebruikte bronnen zijn officiële documentatie of de officiële implementatierepository van de
betrokken platformleverancier:

- Google Chrome: [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access),
  [persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api),
  [PWA file handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling)
- Apple WebKit: [Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
  [writable-streamimplementatie](https://github.com/WebKit/WebKit/pull/37266),
  [OPFS](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/),
  [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/),
  [Background Sync issue](https://bugs.webkit.org/show_bug.cgi?id=182565)
- Microsoft: [OneDrive Files On-Demand Windows](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-windows-0e6860d3-d9f3-4971-b321-7092438fb38e),
  [macOS](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-mac-529f6d53-e572-4922-a585-e7a318c135f0),
  [SPA auth](https://learn.microsoft.com/en-us/entra/identity-platform/reference-third-party-cookies-spas),
  [authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
  [refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens),
  [app-only](https://learn.microsoft.com/en-us/entra/identity-platform/app-only-access-primer),
  [OneDrive permissions](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference?view=odsp-graph-online),
  [download](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0),
  [CORS](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors?view=odsp-graph-online),
  [simple upload](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0),
  [upload sessions](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0),
  [bestandsgroottelimieten](https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa),
  [DriveItem](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0),
  [throttling](https://learn.microsoft.com/en-us/graph/throttling)
- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
  [Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/),
  [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/),
  [Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
