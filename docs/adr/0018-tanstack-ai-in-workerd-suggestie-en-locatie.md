# TanStack AI (Gemini) in workerd geverifieerd; suggestie + locatie-gok zonder custom model

De AI-suggestie van het reviewscherm draait **server-side in een Worker-route** via **`@tanstack/ai` +
`@tanstack/ai-gemini`** (model `gemini-2.5-flash`), met de key uit `GEMINI_API_KEY`. Eén call levert zowel
een **Beschrijving** als een **Locatie-plaatsnaam** op. Deze ADR legt drie dingen vast die deze sessie
geverifieerd/geleerd zijn: (1) het draait écht in **workerd** (de P0-spike was Node-only), (2) de hybride
locatie-gok werkt met het **standaardmodel — geen custom/fine-tuned model nodig**, en (3) een env-valkuil.

## Geverifieerd / geleerd

- **`@tanstack/ai`(-gemini) werkt in workerd** (`alchemy dev`), niet alleen in Node. Eerste runtime-
  bevestiging buiten de spike — relevant voor de `SuggestionClient` in plan P4.
- **Geen custom model nodig** (de vraag die dit triggerde). `gemini-2.5-flash` doet de **hybride locatie-gok**
  uit ADR-0008 out-of-the-box: landmark-herkenning via vision (foto → "London") én terugval op de
  **gebeurtenis/mapnaam-context** als het beeld geen herkenbare plek heeft (foto zonder landmark +
  "Zomervakantie Frankrijk" → "Frankrijk"). Gemini geeft een **plaatsnaam**, nooit ruwe coördinaten — de
  client geocodet die naam (ADR-0017).
- **`chat({ stream: false })` → `Promise<string>`** (de verzamelde tekst). Dat is de laagste-risico vorm.
- **Structured-ish output in het prototype = JSON-in-tekst.** De prompt vraagt strikte JSON
  (`{description, place}`) die we parsen (met code-fence-strip + fallback), om `effect/Schema` niet het
  wegwerp-prototype in te trekken. **Productie** gebruikt de bewezen spike-weg:
  `outputSchema = Schema.toStandardJSONSchemaV1(Suggestion)` + `Schema.decodeUnknownSync` (ADR-0012, P4).
- **Env-valkuil.** Alchemy lost Worker-secrets op uit **`.env.local`** via `Config.redacted` (regel
  `config({ path: ".env.local" })` in `alchemy.run.ts`), **niet uit `.dev.vars`**. Een niet-gezette key komt
  als **lege string** in `env` aan (`typeof === "string"`, maar falsy) → guard op falsy + fallback, niet op
  `undefined`.

## Considered Options

- **`@tanstack/ai` + `@tanstack/ai-gemini`** (gekozen): bevestigt ADR-0012/spike #3 (native `@google/genai`,
  geen OpenAI-compat-gat). `@effect/ai-openai` blijft verworpen (Responses-API-only → 404 op Gemini).
- **Rauwe Gemini REST-fetch**: workerd-veilig (pure `fetch`) en op de plank als fallback (`checkRaw.mjs`),
  maar we kozen de TanStack-lib conform de stack-beslissing.
- **Streaming server vs. niet-streamend + client-animatie**: gekozen voor **niet-streamend** (`stream:false`)
  + de tekst client-side woord-voor-woord animeren — minder protocol-risico, zelfde "stream"-gevoel. Echte
  token-streaming (`toHttpResponse`/SSE) kan later.

## Consequences

- **Dynamische import in de handler** (`await import("@tanstack/ai"...)`) zodat een workerd-load/runtime-fout
  per-request wordt opgevangen (→ 503/500 → client-fallback naar de simulatie) i.p.v. de route-tree te
  breken bij build.
- **Prototype draait de AI-pas per foto-navigatie** (één Gemini-call per foto), losgekoppeld van "mist
  beschrijving" — anders zou de locatie-gok ontbreken op foto's die al een Beschrijving hebben. **Productie**
  gate't op de review-filter ("mist Beschrijving óf Locatie", oRPC §6) om calls te besparen.
- **De XState-actor-swap hield de statechart ongewijzigd** ([[0015]]): alleen `streamSuggestion` wisselde van
  simulatie naar de echte route; de suggestie + `location.suggested` lopen via dezelfde events.
- **Kosten/limieten**: per-foto vision-calls tikken aan; in prod gegate + via `effect/Config` (key redacted).

## Status

**Geaccepteerd / geverifieerd (2026-06-06).** Server-route `web/src/routes/prototypes/api/suggest.ts` levert
`{description, place}` uit echte Gemini-calls in workerd; de hybride locatie-gok is bevestigd met het
standaardmodel. Bevestigt ADR-0008 (locatie-gok haalbaar) en ADR-0012/spike #3 (nu ook in workerd). De
productie-`SuggestionClient` (effect/Schema-output, server-side geocoding-key) volgt in P4/P7.
