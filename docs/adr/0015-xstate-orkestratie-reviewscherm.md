# XState als orkestratielaag voor het reviewscherm (grens met TanStack Query en TanStack AI)

Het reviewscherm van de **Beheer-webapp** wordt gemodelleerd als een **XState v5-statechart**, met een
expliciete eigenaarschapsgrens tussen drie lagen. Besloten en geprototypet op `Splitscreen` (de gekozen
richting, ADR-0014): `web/src/prototypes/machine/{reviewMachine,photoMachine}.ts`.

```
reviewMachine (parent, parallel)        ── orkestratie
├─ session:  loading → reviewing (invoke photoMachine) ;  navigatie reenter't
├─ help:     closed ⇄ open
└─ writes:   optimistische write-queue — gespawnde write-job-actors
   photoMachine (child, per Foto)       ── edit-lifecycle + drafts; output draagt de beslissing omhoog
```

## De grens (de kern van de beslissing)

| Laag | Eigenaar van | Niet van |
|---|---|---|
| **TanStack Query** | remote waarheid + cache: de Library laden, de optimistische snapshot, de write-mutations + `write.status`-poll | UI-modi, volgorde |
| **TanStack AI** | de generatieve **Suggestie** (stream van Gemini); een proces-over-tijd | of iets is "dirty"/"saving" |
| **XState** | *modi, volgorde, drafts, write-queue*: cursor, `pristine→dirty`, suggestie-lifecycle, navigatie-guards, en het inplannen van writes. Triggert Query/AI via **invoked/spawned actors** | de data of async-resultaten zelf bewaren |

**Vuistregel tegen dubbele waarheid:** Query/AI bezitten *data & async-resultaten*; XState bezit *modi,
volgorde & drafts*. Afleidbare booleans (`isSaving`, `isDirty`) zijn **states/tags**, geen context.

## Considered Options

- **XState v5-statechart** (gekozen): er zijn echte eindige modi (suggestie-stream, dirty/saving,
  laad-/foutpaden), async-workflows met annulering (navigeren tijdens streamen/opslaan), en meerdere
  samenwerkende processen (AI-suggestie + write-queue). Dat is statechart-werk. Concreet:
  - **Named actors in `setup({ actors })`** → het mock-prototype en de echte app delen *exact dezelfde
    statechart*; alleen de actor-implementaties wisselen (`loadLibrary`→oRPC/Query, `streamSuggestion`→
    `@tanstack/ai-react`, `writeJob`→`approve.*`/`write.status`).
  - **Parent + per-Foto child** (ADR-keuze): de parent blijft grof (cursor, queue, help); de child bezit de
    edit-lifecycle van één foto en geeft via `output` (approved/skipped + payload) de beslissing omhoog —
    de parent beslist welke writes nodig zijn (`description` PATCH en/of `location_orientation` workflow,
    domain-model §5).
  - **`writes`-regio met gespawnde actors** = de optimistische, navigatie-overlevende write-queue uit
    ADR-0009/0011; statussen (`running→succeeded/failed`) leven los van de actieve foto.
  - **UI gedreven door de machine**: `snapshot.matches(...)`, tags (`suggesting`, `dirty`, `loading`,
    `overlay`) en guards (`canNext`/`canPrev`) sturen knoppen én sneltoetsen — geen parallelle stapel
    handmatige booleans.
- **Platte React-state + hooks** (de eerste prototype-versie): verworpen — navigatie-, edit- en
  async-logica raakten verweven; geen enkele bron voor "in welke modus zit ik".
- **`@xstate/store`**: verworpen — geen eindige modi, geen invoked async, geen actor-communicatie; te licht
  voor dit domein. (Wél prima voor losse, simpele event-state elders.)

## Consequences

- **Mock↔echt zonder hertekenen.** De statechart is af; het echte aankoppelen (ADR-plan P5/P6) is enkel het
  vervangen van drie actor-implementaties. De UI verandert niet.
- **Testbaar zonder UI.** Transities, guards, child-`output` en de write-queue zijn te testen met
  `createActor(...)` + `machine.provide({ actors })` (deterministisch, zonder timers). Tests staan naast de
  machines.
- **Prototype-scope.** De machines leven nu in `src/prototypes/` (lint-genegeerd, net als `spike/**`). Bij
  promotie naar `src/routes/**` (P7) verhuizen ze mee; de actor-grens en de regio-indeling blijven.
- **Optimistische UI valt samen met de queue.** `approve` → child final → parent: optimistische
  `queryClient.setQueryData` + spawn write-job(s) + cursor vooruit. Statussen komen terug via de actors
  (in productie via `write.status`-poll), exact het ADR-0009/0011-model.
- **Visualiseerbaar.** De statechart is in Stately Studio te openen voor ontwerp/communicatie.

## Status

**Geaccepteerd voor het prototype (2026-06-06).** Geïmplementeerd in
`web/src/prototypes/machine/`; `xstate` + `@xstate/react` toegevoegd aan `web/package.json`.
Verfijnen/herijken bij het promoveren naar het echte reviewscherm (P7).

> **Noot (2026-06-06) — cursor verhuisd naar de URL (TanStack Router).** Vervolgens is besloten dat de
> navigatie-staat uit de **URL** komt i.p.v. uit machine-context. Gevolg voor dit ontwerp:
> - **`reviewMachine` is vervallen.** De cursor (welk event/welke foto) zit nu in het pad
>   (`/prototypes/splitscreen/$eventId/$photoId`); navigatie = `navigate(...)`, niet een `assign` in de
>   machine. Wat van XState overblijft: **`photoMachine`** (per foto, geremount via `key={photoId}`) +
>   **`writeQueueMachine`** (lang-levende actor in de layout via `createActorContext`). De actor-grens en
>   de optimistische-queue zijn identiek; alleen "welke foto" is nu de URL — dit maakt de "geen dubbele
>   waarheid"-regel nóg strakker (de router bezit de cursor, Query de data, XState de modi/drafts/queue).
> - **Route-vorm:** event + foto = **path-params**; **filter + kaart-viewport (`lat/lng/z`) = search-params**,
>   gevalideerd met `effect/Schema` via `Schema.toStandardSchemaV1(...)` als TanStack Router `validateSearch`
>   (dogfoodt de contract-laag van ADR-0012/0013, nu óók in een route — werkt in SSR + client). De
>   help-overlay is bewust **lokale state** (niet in de URL). Zie [[0017]] voor de kaart-viewport.
> - **Wedge-les (kostte een dev-server-crash):** méérdere zware **SSR-routes tegelijk via live HMR**
>   toevoegen wedde de cloudflare-vite dev-worker (bekende plugin-valkuil, versterkt door `effect@4-beta`
>   in de worker-bundle). `effect/Schema` in een route is op zich prima — het werkte na een **schone
>   herstart**. Vuistregel: houd de zware review-UI **client-only** (`ClientOnly`) en voeg nieuwe SSR-routes
>   toe met een server-herstart, niet al-doende via HMR.
> - **Tests:** `photoMachine.test.ts` + `writeQueueMachine.test.ts` (de oude `reviewMachine.test.ts` is
>   met de machine verwijderd).
