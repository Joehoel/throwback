# Research: personen/gezichten uit OneDrive (voor "naambordjes")

Status: **research afgerond, nog niet geïmplementeerd** · Datum: 2026-05-29

## Doel

We willen in de slideshow **naambordjes boven de hoofden** van personen kunnen tonen
(met een toggle in Instellingen), gebaseerd op de personen die OneDrive al in foto's herkent.
Vraag: is die gezichts-/persoonsdata op te halen, en zo ja hoe?

## Korte conclusie

**Ja, het kan — via een ongedocumenteerd OneDrive-endpoint** dat de OneDrive-web-app
(Foto's → Personen) zelf gebruikt. Per foto zijn de **gezichts-bounding-boxes + de naam**
op te vragen. De **gedocumenteerde** Graph-API biedt dit níét (de `photo`-facet is puur EXIF).

Belangrijkste openstaande risico vóór implementatie: **auth/host** — het endpoint zit op de
consumer-host `onedrive.live.com/.../_api/v2.1`, terwijl onze app een Graph-token (`Files.Read`)
gebruikt. Of ons token daar geaccepteerd wordt, moet een spike uitwijzen.

## Hoe gevonden

Met de browser-harness de ingelogde OneDrive-web-sessie geopend, een `fetch`/`XHR`-hook
geïnjecteerd (via `Page.addScriptToEvaluateOnNewDocument`), en de netwerkcalls afgevangen bij:
**Foto's (top-nav) → Personen → een persoon openen**. Auth-header afgevangen via
`Network.requestWillBeSentExtraInfo`.

## Wat de gedocumenteerde API NIET geeft

- `driveItem.photo`-facet = alleen camera/EXIF (opnamedatum, camera, ISO…). Geen personen.
- Geen `people`/`faces`-veld op `driveItem`, ook niet in Graph **beta**.
- OneDrive's "Personen" is AI-gezichtsgroepering, privé, web-only, niet in de gedocumenteerde API,
  en wordt niet teruggeschreven naar het bestand (dus ook geen XMP-route nodig).

## De ongedocumenteerde endpoints (`_api/v2.1`)

Host: `https://onedrive.live.com/personal/{driveId}/_api/v2.1/…`
Thumbnails/content: `https://my.microsoftpersonalcontent.com/personal/{driveId}/_api/v2.1/…`
(`{driveId}` = de persoonlijke drive-id, bv. uit Graph `me/drive`.)

### 1. Lijst van herkende personen (persoon-groepen)

```
GET …/_api/v2.1/drives/{driveId}/recognizedEntities
      ?top=200
      &$filter=identity/user/displayname ne null        # named; "eq null" = naamloze groepen
      &expand=identity/user(/thumbnails)
```

Respons (`value[]`), per persoon:
```jsonc
{
  "id": "<entityId>",
  "photoCount": 1430,
  "isHidden": false, "isPinned": false,
  "representativeItemId": "<driveItemId>",
  "identity": { "user": {
    "displayName": "<Naam>",            // ontbreekt bij naamloze groepen
    "id": "<entityId>",
    "thumbnails": { "source": {
      "url": "https://my.microsoftpersonalcontent.com/.../thumbnails/0/c256x256/content?...&vl=785&vt=1574&vw=1320&vh=1320",
      "width": 3024, "height": 4032,
      "sourceCropRegions": [ { "boundingBoxX":785, "boundingBoxY":1574, "boundingBoxWidth":1320, "boundingBoxHeight":1320 } ]
    }}
  }}
}
```

### 2. Per foto: gezichten + namen  ← **dit is wat naambordjes nodig hebben**

Foto-items kun je expanden met `detectedEntities`:
```
GET …/_api/v2.1/drives/{driveId}/items/root/items
      ?$filter=photo ne null and (detectedEntity/recognizedEntity/id eq '<entityId>')
      &orderby=photo/takenDateTime desc
      &select=id,name,photo,image,location,…
      &expand=detectedEntities(recognizedEntity())
```

En de "bevestigingen" per persoon laten de exacte vorm van een gedetecteerd gezicht zien:
```
GET …/_api/v2.1/drives/{driveId}/recognizedEntities/{entityId}/oneDrive.getConfirmations
      ?expand=detectedEntities(expand=recognizedEntity(expand=identity/user/thumbnails))
```

Elk **`detectedEntities[]`**-item:
```jsonc
{
  "id": "<faceId>",
  "boundingBoxLeft": 584, "boundingBoxTop": 635,      // in BRONPIXELS van de foto
  "boundingBoxWidth": 435, "boundingBoxHeight": 602,
  "recognizedEntity": {
    "id": "<entityId | uncertain_<entityId>>",         // "uncertain_…" = nog niet bevestigd
    "identity": { "user": { "displayName": "<Naam>", "id": "<entityId>" } }
  }
}
```

→ Per foto-item dus: **lijst van gezichten met bounding box (bronpixels) + `displayName`.**

### 3. Enkel item ophalen (ter referentie)
```
GET …/_api/v2.1/drives/{driveId}/items/{itemId}
      ?select=…,image,location,photo,…
```
De `image`-facet geeft `width`/`height` (bron-afmetingen) — nodig om de bounding boxes te
normaliseren en op de getoonde (Fit-geschaalde) foto te plaatsen.

## Auth

- Calls gebruiken `Authorization: bearer <token>` (MSA-token, prefix `EwA…`), **geen cookie-only**.
- Onze app gebruikt nu een **Graph**-token (device-code, scope `Files.Read offline_access`,
  audience `graph.microsoft.com`). Of dat token op `onedrive.live.com/_api/v2.1` geaccepteerd
  wordt, is **niet getest** — dit is het go/no-go-punt.

## Risico's / open vragen

1. **Token-audience** — werkt ons Graph-token op het `_api/v2.1`-endpoint? Zo niet: een token
   met de juiste consumer-scope ophalen via dezelfde refresh-flow.
2. **Graph-alternatief** — ondersteunt `graph.microsoft.com/v1.0/me/drive/items/{id}` mogelijk
   óók `$expand=detectedEntities(...)`? Dat zou de nettere route zijn (zelfde host/token als nu).
3. **Ongedocumenteerd** — Microsoft kan dit zonder waarschuwing wijzigen/uitzetten.
4. **Confirmed vs uncertain** — alleen bevestigde/benoemde entiteiten tonen; `uncertain_…` en
   naamloze groepen overslaan.
5. **Coördinaten** — bounding boxes zijn in bronpixels; omrekenen via de `ContentScale.Fit`-
   transform (letterbox-offset + schaal) met `image.width/height` + containermaat.

## Voorgesteld plan (als de spike slaagt)

1. **Spike (go/no-go):** vanuit de app één foto opvragen met
   `…/items/{itemId}?$expand=detectedEntities(recognizedEntity(identity/user))` — eerst tegen
   Graph, dan tegen `_api/v2.1` — met ons token. 200 + boxes? Anders: juiste scope/token zoeken.
2. **Data:** tijdens de crawl (`GraphSync`) per foto de `detectedEntities` ophalen; opslaan in een
   nieuwe tabel `face(photo_id, naam, left, top, width, height)` + de bron-afmetingen in `PhotoRow`.
3. **UI:** toggle "Naambordjes" in `Settings`/`SettingsScreen`; in `SlideshowCanvas` per gezicht een
   label boven de box renderen, box omgerekend via de Fit-transform. Alleen benoemde personen.

## Reproductie (browser-harness)

Foto's-tab linksboven → Personen (top-nav) → persoon openen. Netwerk-hook injecteren met
`Page.addScriptToEvaluateOnNewDocument` en filteren op `recognizedEntities` / `detectedEntit`.
Auth-header via CDP `Network.requestWillBeSentExtraInfo`.
