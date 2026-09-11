# Onderzoek: randvoorwaarden voor automatische Gemini-suggesties

Status: **onderzoek afgerond** · Peildatum: **2026-09-11** · Ticket:
[#32](https://github.com/Joehoel/throwback/issues/32)

## Vraag en afbakening

Welke actuele Gemini-mogelijkheden en beperkingen bepalen een verantwoorde automatische
suggestieflow voor privé-familiefoto's? Dit document inventariseert beeldverwerking, structured
output, batch- en achtergrondverwerking, latency, quota en kosten, dataretentie/privacy en
fout-/safetygedrag. Het geeft opties en harde randvoorwaarden voor een latere lifecyclebeslissing;
het is geen implementatieplan en kiest nog geen model of triggermoment.

Alle externe bronnen hieronder zijn primaire, officiële Google- of Gemini-bronnen.

## Korte conclusie

Automatisch **voorstellen** is technisch haalbaar; automatisch als Beschrijving of Locatie
**vastleggen** niet verantwoord. Gemini ondersteunt beeldinput, schema-afgedwongen JSON en zowel
synchrone als bulk-asynchrone verwerking. De doorslaggevende afweging is niet capaciteit of prijs,
maar **hoeveel beeld- en resultaatdata buiten Throwback mag blijven staan**:

- Gebruik voor deze privéfoto's alleen een **Paid Service**. De gratis dienst mag invoer en uitvoer
  voor productverbetering en menselijke review gebruiken; bovendien mogen API-clients in de EER,
  Zwitserland en het VK alleen Paid Services gebruiken. Paid prompts en responses worden niet voor
  productverbetering gebruikt, maar zonder goedgekeurde Zero Data Retention (ZDR) bewaart de Gemini
  Developer API ze nog **55 dagen voor misbruikdetectie**.[^terms][^abuse]
- De minst persistente Developer-API-variant is een stateless `generateContent`-aanroep met inline,
  lokaal verkleind beeld, logging uit en zonder Files API, grounding of expliciete cache. Dat voorkomt
  projectlogs en bestandsopslag, maar niet de 55-daagse abuse-log zolang ZDR niet is goedgekeurd.[^logs][^zdr]
- De Batch API is geschikt voor een backlog: 50% van de standaard tokenprijs, structured output,
  doeldoorlooptijd tot 24 uur. Daar staat expliciete serveropslag tegenover: uploads leven maximaal
  48 uur en batchresultaten standaard zes weken. Een batchjob die langer dan 48 uur pending/running
  is, verloopt zonder resultaat.[^batch][^files]
- Interactions `background=true` is geen goedkope bulkmodus. Het is bedoeld voor lange individuele
  taken, vereist opgeslagen interacties en is daarom onverenigbaar met `store=false`; Paid Tier
  bewaart zo'n interactie standaard 55 dagen. De Interactions API is bovendien bèta en ondersteunt
  Batch niet.[^background][^interactions]
- Structured output garandeert syntactisch schema-conforme JSON, **niet** dat een beschrijving,
  plaats of zelfgerapporteerde zekerheid waar is. Google schrijft voor om waarden zelf te valideren
  en benadrukt post-processing en menselijke evaluatie.[^structured][^safety-guidance]

Voor de latere lifecyclekeuze zijn daarmee drie serieuze modi over: per foto on-demand, een begrensde
Throwback-eigen voorverwerkingswachtrij met stateless calls, of Gemini Batch voor niet-urgente bulk.
Een strikte eis van geen at-rest kopie bij de aanbieder sluit Gemini Batch en Interactions-background
op basis van de huidige publieke documentatie uit.

## 1. Beeldresolutie en verkleining

### Wat de API kan

Gemini ondersteunt onder meer JPEG, PNG, WebP, HEIC en HEIF en kan beelden captionen,
classificeren en visueel bevragen. Een request mag technisch maximaal 3.600 beeldbestanden bevatten.
Inline beelddata heeft volgens de image-understandinghandleiding een totale requestlimiet van 20 MB;
grotere of hergebruikte bestanden kunnen via de Files API.[^images]

Er zijn twee verschillende hefbomen die niet door elkaar gehaald moeten worden:

1. **Lokale pixelverkleining** bepaalt welke pixels en metadata Throwback überhaupt verstuurt.
2. **`media_resolution`** bepaalt hoeveel mediatokens Gemini maximaal aan het ontvangen beeld
   besteedt; het is geen privacymaatregel en vervangt lokale verkleining niet.

De algemene tokenregels zeggen dat een beeld waarvan beide zijden maximaal 384 px zijn 258 tokens
kost. Grotere beelden worden in 768×768-tegels verwerkt, elk 258 tokens. Een 512×384-variant valt dus
niet in de goedkope één-tegelcategorie alleen omdat één zijde 384 px is.[^tokens]

Gemini 3 voegt expliciete mediaresoluties per beeld toe:

| Niveau | Beeldtokens (circa) | Gedocumenteerde afweging |
|---|---:|---|
| `low` | 280 | snel/goedkoop, minder detail |
| `medium` | 560 | balans |
| `high` | 1.120 | aanbevolen door Google voor de meeste beeldanalyse |
| `ultra_high` | 2.240 | alleen per beeld; specialistische gevallen |

Hogere niveaus verhogen detailwaarneming, latency en kosten. Per-image instellingen zijn alleen voor
Gemini 3; Google adviseert de niveaus op de eigen toepassing te evalueren.[^media-resolution]

### Consequenties voor privé-familiefoto's

- **Het origineel is niet nodig als transportformaat.** Een tijdelijk, correct georiënteerd derivaat
  kan bytes, EXIF en detail minimaliseren. Dit is dataminimalisatie; `media_resolution=low` stuurt nog
  steeds het volledige aangeleverde bestand naar Google.
- **384 px is een kostenknik, geen aangetoonde kwaliteitsgrens.** Het kan genoeg zijn voor grove
  beschrijvingen, maar kleine gezichten, tekst, landmarks en achtergrondcontext kunnen verdwijnen.
  Google publiceert geen Throwback-specifieke kwaliteitscurve.
- **Resolutie moet per taak worden beoordeeld.** Een korte scènebeschrijving en een plaatsgok hebben
  andere detailbehoeften. De documentatie ondersteunt geen conclusie dat één formaat beide goed doet.
- Google noemt correcte rotatie en niet-wazige input expliciet als voorwaarden voor goede resultaten.[^images]

**Harde grens:** er is geen documentatiebasis om de volledige bibliotheek op originele resolutie te
versturen “voor de zekerheid”. Start van de lifecyclebeslissing moet een expliciet toegestaan
derivaatniveau zijn; hoger detail vereist een aantoonbare kwaliteitswinst die de extra datadeling
rechtvaardigt.

## 2. Structured output en betekenis

Gemini kan een antwoord laten voldoen aan een opgegeven JSON Schema. De ondersteunde subset omvat
objecten, arrays, strings, getallen, booleans, `null`, enums, verplichte velden en enkele begrenzingen.
Zeer grote of diep geneste schema's kunnen worden afgewezen. Structured output werkt ook binnen
Batch requests.[^structured][^batch]

Dit maakt een klein resultaatcontract haalbaar met bijvoorbeeld een Beschrijving, optionele
plaatsnaam en een expliciete uitkomst “geen suggestie”. `null` wordt officieel ondersteund. De
belangrijkste beperking is semantisch: Google waarschuwt dat schema-conforme waarden nog fout kunnen
zijn en altijd door de applicatie gevalideerd moeten worden.[^structured]

Daarom gelden voor de lifecyclebeslissing deze grenzen:

- Schema-validatie is alleen een **transportgarantie**, geen feitelijkheids- of kwaliteitsgarantie.
- Een modelscore of tekst als “confidence” is zonder kalibratie geen kans en mag geen automatisch
  schrijfrecht geven.
- Het contract moet kunnen **onthouden/abstain**; anders dwingt automatisering het model feitelijk tot
  raden.
- Lengte, taal, verboden persoonsgegevens en domeinregels blijven eigen validaties, ook als JSON
  geldig is.
- De bestaande domeinregel blijft leidend: een Suggestie wordt pas Beschrijving nadat de vader die
  goedkeurt. Google noemt korte output met menselijke review zelf een lager-risicopatroon.[^safety-guidance]

## 3. Verwerkingsmodi voor de latere lifecyclekeuze

| Modus | Latency / kosten | Dataretentie-eigenschap | Geschikt wanneer |
|---|---|---|---|
| **On-demand Standard `generateContent`** | Google classificeert Standard als seconden tot minuten; volle tokenprijs | Requestopslag staat standaard uit, maar abuse-monitoring blijft zonder ZDR | Alleen bekeken foto's mogen kosten/dataoverdracht veroorzaken en de gebruiker kan wachten |
| **Throwback-eigen begrensde wachtrij met Standard** | Zelfde calls en prijs; zichtbare wachttijd kan buiten de reviewactie vallen | Zelfde stateless profiel; Throwback bewaart zelf status/resultaat | Suggesties kort vooruit mogen worden gemaakt zonder provider-jobopslag |
| **Flex inference** | Synchroon, 50% korting, doel 1–15 min, best-effort en “sheddable” | Geen apart batchresultaat genoemd; normale requestregels blijven gelden | Niet-interactief werk met een runner die lange calls en pre-emption kan verdragen |
| **Gemini Batch API** | Asynchroon, 50% korting, doel ≤24 uur; job verloopt na 48 uur | Inputbestanden 48 uur; resultaten standaard 6 weken | Grote, niet-urgente backlog en expliciete provideropslag acceptabel zijn |
| **Interactions background** | Individuele lange taak; vermijdt typische HTTP-timeout rond 60 s; geen batchkorting gedocumenteerd | `store=true` vereist; Paid-retentie standaard 55 dagen | Alleen werkelijk lange individuele redeneertaken, niet gewone fotobeschrijvingen |
| **Vertex AI / Gemini-batch** | Online en multimodale batch beschikbaar; eigen GCS/BigQuery-invoer en -uitvoer | Geen training zonder toestemming; regionale controls en aanvraag tot abuse-log-opt-out; eigen bucket/table-retentie | Dataresidentie, IAM en controle over batchopslag zwaarder wegen dan eenvoud |

De latency- en prijsclassificaties komen uit Google's inference-overzicht.[^optimization] Batch verwerkt
iedere regel als een volledige `GenerateContentRequest`; een eigen sleutel koppelt output aan input,
en een regel kan een response óf status/error opleveren. Dit is veiliger te isoleren per foto dan
veel foto's als één semantische prompt te behandelen.[^batch]

Vertex AI is een afzonderlijke platformkeuze, niet alleen een andere endpointnaam. Google zegt dat
klantdata daar niet zonder voorafgaande toestemming voor training wordt gebruikt. Verdachte prompts
kunnen voor abuse-onderzoek tot 90 dagen in de gekozen regio/multiregio worden gelogd; een goedgekeurde
opt-out voorkomt die promptopslag. Batchinput en -output staan in door de klant gekozen Cloud Storage
of BigQuery. Dat geeft meer governance, maar creëert ook expliciet te beheren opslag.[^vertex-zdr][^vertex-abuse][^vertex-batch]

### Wat niet hetzelfde is

- Meerdere foto's in één prompt (maximaal 3.600) is **contextbundeling**, niet de Batch API. De foto's
  beïnvloeden dan één modelantwoord en delen context/tokenlimiet.
- `background=true` is **duurzame uitvoering van één Interaction**, niet goedkope bulkverwerking.
- Een app-wachtrij maakt normale API-calls op de achtergrond, maar verandert Google's service tier,
  prijs of quota niet.

## 4. Latency, quota en kosten

### Latency

Google geeft voor Standard alleen “seconden tot minuten”, niet een harde responstijd-SLA. Flex heeft
een doel van 1–15 minuten en kan worden afgebroken bij capaciteitsdruk. Batch heeft een doel van 24
uur, vaak sneller, maar kan tot 48 uur pending/running blijven voordat de job zonder resultaat
verloopt.[^optimization][^batch]

**Harde grens:** geen lifecycle mag succes binnen een vaste interactieve tijd veronderstellen. Alleen
Priority wordt als seconden/non-sheddable gepositioneerd, tegen 75–100% toeslag op Standard; zelfs dan
blijven API- en safetyfouten mogelijk.[^optimization]

### Quota

Developer-API-limieten gelden per project, niet per key, over RPM, input-TPM en RPD. Werkelijke limieten
zijn model- en accountafhankelijk, staan in AI Studio en zijn volgens Google niet gegarandeerd.
Previewmodellen zijn beperkter. Overschrijding geeft `429`.[^rate-limits]

Batch heeft aparte limieten:

- maximaal 100 gelijktijdige batchrequests;
- maximaal 2 GB per JSONL-inputbestand en 20 GB totale Files-API-opslag;
- een maximum aan gelijktijdig ingequeue-de tokens per model en billing tier. Op Tier 1 is dit op de
  peildatum bijvoorbeeld 3 miljoen voor `gemini-3.5-flash` en 10 miljoen voor
  `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` en `gemini-2.5-flash-lite`.[^rate-limits]

Bij circa 20.000 foto's en 1.120 beeldtokens per foto is alleen het beeld al circa 22,4 miljoen
tokens. Dat past dus niet als één gelijktijdig ingequeue-de Tier-1-backlog bij de genoemde modellen.
Dit verhindert bulkverwerking niet, maar is wel een harde bovengrens aan hoeveel werk tegelijk actief
kan zijn.

### Kosten

De prijs is per input- en outputtoken; thinkingtokens tellen als output. De huidige Paid Tier-prijzen
voor enkele technisch geschikte stabiele modellen zijn:[^pricing]

| Model | Positionering volgens Google | Standard input / output per 1M tokens | Batch input / output |
|---|---|---:|---:|
| `gemini-3.5-flash-lite` | recente, goedkope multimodale high-throughput/extractie | $0,30 / $2,50 | $0,15 / $1,25 |
| `gemini-3.1-flash-lite` | lichte taken en eenvoudige structured extractie | $0,25 / $1,50 | $0,125 / $0,75 |
| `gemini-2.5-flash` | bestaande Throwback-spike; multimodaal met thinking | $0,30 / $2,50 | $0,15 / $1,25 |
| `gemini-2.5-flash-lite` | goedkoopste van deze opties, eenvoudige extractie | $0,10 / $0,40 | $0,05 / $0,20 |

Alle vier accepteren beelden, leveren tekst, ondersteunen structured output en Batch.[^model-35-lite][^model-31-lite][^model-25-flash][^model-25-lite]

Illustratie, geen begroting: bij `gemini-3.5-flash-lite` op `high`, 150 tekst-inputtokens en 80
outputtokens kost één Standard-call ongeveer
`(1.120 + 150) × $0,30/M + 80 × $2,50/M = $0,000581`; 20.000 foto's ongeveer **$11,62**. Batch
halveert dat naar ongeveer **$5,81**. Werkelijke kosten moeten uit `usageMetadata` komen, omdat prompt,
response, thinking, resolutie en modelkeuze variëren.

Kosten zijn daarmee waarschijnlijk geen harde blokkade. Outputlengte/thinking, gekozen beeldresolutie
en nutteloos vooraf gegenereerde suggesties zijn de voornaamste vermijdbare kostenposten.

## 5. Dataretentie, privacy en gebruiksvoorwaarden

### Gemini Developer API

| Aspect | Huidige officiële regel | Betekenis voor Throwback |
|---|---|---|
| Unpaid | Invoer/uitvoer mag productverbetering voeden en door menselijke reviewers worden bekeken; geen gevoelige, vertrouwelijke of persoonlijke data insturen | **Uitgesloten** voor privé-familiefoto's |
| Paid training | Prompts, bestanden en responses worden niet voor productverbetering gebruikt | Noodzakelijke ondergrens, niet hetzelfde als geen retentie |
| Abuse monitoring | Prompt/context/output 55 dagen; alleen voor beleidshandhaving; gemarkeerde inhoud kan door bevoegde medewerkers worden beoordeeld | Zonder ZDR kan beeld/context buiten Throwback worden bewaard en ingezien |
| Projectlogs | `generateContent` standaard `store=false`; Interactions standaard `store=true`; opgeslagen logs 7/14/28/55 dagen configureerbaar | Gebruik van de ene API-default zegt niets over de aparte abuse-log |
| ZDR | Aanvraag en goedkeuring per project; daarna worden inhoud en identificeerbare metadata vóór abuse-logging verwijderd | Vereist als werkelijk nul identificeerbare providerretentie een harde eis is |
| Files API | At-rest tot handmatig verwijderen of automatisch na 48 uur | Inline derivaat heeft een kleiner opslagoppervlak |
| Batchresultaten | Standaard zes weken downloadbaar | Bulk is niet “verwerken en meteen vergeten” |
| Interactions background | Vereist `store=true`, standaard 55 dagen Paid | Onverenigbaar met stateless/no-store |
| Impliciete cache | Project-geïsoleerd RAM, TTL 24 uur, volgens Google verenigbaar met ZDR | Geen at-rest kopie, maar wel tijdelijke verwerking |
| Grounding Search/Maps | Verplichte opslag 30 dagen, niet uit te zetten | Niet gebruiken als minimale retentie vereist is |

Bronnen: Terms, abuse monitoring, logging, ZDR, Files en Batch.[^terms][^abuse][^logs][^zdr][^files][^batch]

De Paid Terms zeggen bovendien dat data tijdelijk of gecachet kan worden in ieder land waar Google
of zijn agents faciliteiten hebben. De Developer API geeft dus geen regionale dataresidentiebelofte
zoals Vertex AI die geeft.[^terms][^vertex-zdr]

### Personen, toestemming en doelbinding

Google verbiedt gebruik dat rechten van anderen schendt, waaronder persoonsgegevens of biometrie
zonder wettelijk vereiste toestemming, en het volgen/monitoren van mensen zonder toestemming.[^prohibited]
Dit onderzoek doet geen juridische uitspraak, maar levert wel een harde productgrens op: een
fotobeschrijving mag niet ongemerkt veranderen in persoonsidentificatie, biometrische profilering of
monitoring. De verantwoordelijke moet een passende grondslag/toestemming voor verwerking van de
familiefoto's, inclusief foto's van kinderen, kunnen dragen.

## 6. Fouten, safety en feitelijkheid

### Technische fouten

De API onderscheidt onder meer:

- `400` voor ongeldige requests/preconditions;
- `429` voor rate limit, korte overbelasting of dagquota;
- `500`, `503` en `504` voor serverfout, onbeschikbaarheid en deadline;
- generation blocks zoals `safety`, `prohibited_content`, `spii`, `recitation` en `content_blocked`.

Google adviseert exponential backoff voor tijdelijke `429`/`5xx`-fouten. Een quota-uitputting,
ongeldig schema of policy-block is geen reden voor onbeperkt dezelfde call herhalen.[^api-errors]

Batchjobs hebben terminale statussen `SUCCEEDED`, `FAILED`, `CANCELLED` en `EXPIRED`; ook binnen een
geslaagde inline batch kan een afzonderlijk item een error in plaats van een response bevatten.[^batch]

### Safety

De instelbare filters bestrijken harassment, hate speech, seksueel expliciete en gevaarlijke inhoud.
Voor Gemini 2.5 en 3 staan de extra instelbare filters standaard uit, maar ingebouwde bescherming van
core harms — waaronder child safety — blijft altijd actief en kan niet worden uitgezet. Een geblokkeerde
prompt heeft `promptFeedback.blockReason` en geen candidates; een geblokkeerde response heeft
`finishReason=SAFETY`, safety ratings en geen teruggegeven inhoud.[^safety-settings]

Google publiceert geen false-positivecijfer voor gewone familiefoto's, zwembad-/badfoto's of foto's
van kinderen. De lifecycle moet een safety-block daarom als normale uitkomst “geen suggestie” kunnen
dragen, zonder de foto als fout of verdacht te labelen.

### Feitelijkheid

Google waarschuwt expliciet voor inaccurate, bevooroordeelde of offensieve output en noemt
post-processing en grondige menselijke evaluatie essentieel. Dezelfde input kan verschillende output
geven.[^safety-guidance] Voor Throwback betekent dit:

- alleen observeerbare, korte voorstellen; geen verzonnen namen, relaties, intenties of gebeurtenissen;
- een plaatsnaam blijft een onbewezen hint totdat de gebruiker die controleert;
- een retry kan variatie geven, maar maakt een antwoord niet automatisch betrouwbaarder;
- safety, transportfout, schemafout en semantische afwijzing moeten onderscheiden uitkomsten blijven;
- nooit automatisch naar canonieke XMP/EXIF schrijven.

## 7. Harde randvoorwaarden voor de lifecyclebeslissing

1. **Paid-only:** geen gratis quota of onbetaalde AI Studio-route voor productiefoto's; voor een
   API-client in de EER is Paid bovendien contractueel verplicht.[^terms]
2. **Menselijke poort:** een Gemini-uitkomst blijft Suggestie. Geen Beschrijving of Locatie wordt
   zonder expliciete goedkeuring canoniek opgeslagen.[^safety-guidance]
3. **Retentiekeuze vóór triggermoment:** bepaal eerst of 55-daagse abuse-retentie acceptabel is of dat
   goedgekeurde ZDR/Vertex-governance vereist is. `store=false` alleen lost abuse-retentie niet op.
4. **Dataminimalisatie:** verstuur een tijdelijk, georiënteerd, metadata-arm derivaat op de laagste
   aantoonbaar bruikbare resolutie; mediaresolutie is aanvullend, geen vervanging.
5. **Abstention en blokkades zijn normale resultaten:** het resultaatcontract en de lifecycle moeten
   “geen suggestie”, safety-block en individuele batchfout kunnen dragen.
6. **Geen identiteits- of gevoelige inferentie:** geen persoonsherkenning, biometrische profilering of
   monitoring zonder de vereiste toestemming/grondslag.[^prohibited]
7. **Geen latency- of capaciteitsaanname:** Standard heeft geen vaste responstijd; quota zijn dynamisch
   en niet gegarandeerd. `429`/`5xx` horen bij normaal operationeel gedrag.[^optimization][^rate-limits]
8. **Bulk impliceert opslag:** Developer Batch bewaart output standaard zes weken; Interactions
   background vereist opslag. Bij een harde no-at-rest-eis vallen die modi af op basis van de huidige
   publieke garanties.[^batch][^interactions]
9. **Modelkwaliteit is nog onbewezen:** officiële capabilities en prijzen tonen haalbaarheid, niet de
   kwaliteit van Nederlandse familiefotobeschrijvingen of plaatsgokken. Model, resolutie en confidence-
   drempel kunnen niet verantwoord uitsluitend uit documentatie worden gekozen.

## 8. Open feiten die documentatie niet beslist

Deze punten zijn geen ontbrekende API-features maar empirische/productkeuzes voor de vervolgbeslissing:

- de werkelijke kwaliteit per resolutie en per stabiel model op de eigen bibliotheek;
- de latencyverdeling vanuit de huidige Cloudflare-regio en de tolerantie van de review-UX;
- de false-positivefrequentie van safety op legitieme familiefoto's, vooral met kinderen;
- welk percentage vooraf gemaakte suggesties daadwerkelijk bekeken en goedgekeurd wordt;
- of 55 dagen abuse-retentie, zes weken batchresultaatretentie of maximaal 90 dagen verdachte
  Vertex-promptretentie acceptabel is;
- of Google voor het beoogde project ZDR/abuse-log-opt-out goedkeurt;
- of verwijderen van een voltooide Developer-batch ook onmiddellijke fysieke verwijdering van het
  outputbestand garandeert. De publieke Batch-documentatie zegt alleen dat verwijderen de job stopt
  en uit de lijst haalt, niet expliciet dat reeds geproduceerde output onmiddellijk is gepurged.[^batch]

## Bronnen

Alle bronnen geraadpleegd op 2026-09-11.

[^images]: Google AI for Developers, [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).
[^tokens]: Google AI for Developers, [Understand and count tokens](https://ai.google.dev/gemini-api/docs/tokens).
[^media-resolution]: Google AI for Developers, [Media resolution](https://ai.google.dev/gemini-api/docs/media-resolution).
[^structured]: Google AI for Developers, [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
[^batch]: Google AI for Developers, [Batch API](https://ai.google.dev/gemini-api/docs/batch-api).
[^background]: Google AI for Developers, [Background execution](https://ai.google.dev/gemini-api/docs/background-execution).
[^interactions]: Google AI for Developers, [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview).
[^optimization]: Google AI for Developers, [Gemini API optimization and inference](https://ai.google.dev/gemini-api/docs/optimization).
[^rate-limits]: Google AI for Developers, [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
[^pricing]: Google AI for Developers, [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing).
[^files]: Google AI for Developers, [Files API](https://ai.google.dev/gemini-api/docs/files).
[^logs]: Google AI for Developers, [Logs and datasets](https://ai.google.dev/gemini-api/docs/logs-datasets).
[^zdr]: Google AI for Developers, [Zero data retention in the Gemini Developer API](https://ai.google.dev/gemini-api/docs/zdr).
[^abuse]: Google AI for Developers, [Abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies).
[^terms]: Google AI for Developers, [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).
[^prohibited]: Google, [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).
[^api-errors]: Google AI for Developers, [API errors](https://ai.google.dev/gemini-api/docs/api-errors).
[^safety-settings]: Google AI for Developers, [Safety settings](https://ai.google.dev/gemini-api/docs/safety-settings).
[^safety-guidance]: Google AI for Developers, [Safety and factuality guidance](https://ai.google.dev/gemini-api/docs/safety-guidance).
[^model-35-lite]: Google AI for Developers, [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
[^model-31-lite]: Google AI for Developers, [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite).
[^model-25-flash]: Google AI for Developers, [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash).
[^model-25-lite]: Google AI for Developers, [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite).
[^vertex-zdr]: Google Cloud, [Gemini Enterprise Agent Platform and zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/vertex-ai-zero-data-retention).
[^vertex-abuse]: Google Cloud, [Abuse monitoring](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring).
[^vertex-batch]: Google Cloud, [Get batch predictions for Gemini](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/batch-prediction-api).
