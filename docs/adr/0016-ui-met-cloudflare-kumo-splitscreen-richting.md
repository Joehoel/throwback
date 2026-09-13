# UI met Cloudflare Kumo; Splitscreen als gekozen reviewscherm-richting

> **Superseded in part:** ADR-0028 replaces Kumo and its token contract with shadcn/ui `base-nova`
> components on Base UI. The validated responsive Splitscreen direction remains accepted.
>
> **Production migration:** ADR-0026 confirms this responsive Kumo/Splitscreen contract, promotes the
> `Review.*` compound shape, and discards the prototype data, timers, routes, providers, and state models.

De UI van de **Beheer-webapp** wordt gebouwd met **`@cloudflare/kumo`** — Cloudflare's eigen
component-library — en **uitsluitend met semantische tokens** (`bg-kumo-*`, `text-kumo-*`,
`border-kumo-*`); nooit ruwe Tailwind-kleuren en **geen `dark:`-variant** (Kumo regelt light/dark zelf via
`light-dark()`). Voor de UX van het reviewscherm zijn drie aanklikbare prototypes verkend; **Splitscreen**
is gekozen als leidende richting.

## Considered Options

**Component-library:**
- **Cloudflare Kumo** (gekozen): past op de Cloudflare/Workers-stack (ADR-0010), batteries-included
  (Sidebar, Dialog, Tabs, Combobox, Empty, Banner, Meter…), Base UI eronder, en een strak token-systeem dat
  consistente theming afdwingt. CLI (`npx @cloudflare/kumo doc/ls`) + `ai/component-registry.json` maken de
  API agent-leesbaar.
- **shadcn/ui** (scaffold-default): prima, maar copy-in componenten + eigen themingwerk; geen reden om naast
  Kumo te blijven hangen voor deze app.
- **Zelf op Tailwind**: meeste werk, minste consistentie. Verworpen.

**UX-richting (drie prototypes onder `web/src/routes/prototypes/`):**
- **1 — Begeleid**: één ding tegelijk, smalle kolom, grote knoppen (kiosk-gevoel, papa-vriendelijk).
- **2 — Werkbank**: zijbalk + statusraster + bewerk-dialog (overzicht eerst, power-tool).
- **3 — Splitscreen** (gekozen): foto links, bewerkpaneel rechts, filmstrip onder, gecentreerde actiebalk.
  Leent zich het best voor doorlopen-op-tempo — de kern van het werk (duizenden foto's nalopen).

**Responsive validatie (`web/src/routes/prototypes/responsive-review.tsx`):**
- **Splitscreen** (gekozen): vanaf `lg` (1024 px) blijft de Foto links zichtbaar naast een vaste editor van
  24 rem; daaronder worden Foto en editor één verticale stroom. De filmstrip en actiebalk blijven aan de
  onderrand bereikbaar.
- **Focus**: Foto en metadata zijn op ieder formaat aparte tabbladen. Dit geeft rust, maar voegt bij bijna
  iedere Foto een wisselstap toe en verbergt relevante context.
- **Inspecteur**: de Foto vult de werkruimte en de editor zweeft erboven als uitklappaneel. Dit beschermt
  beeldruimte, maar bedekt een deel van de Foto en vraagt een extra handeling om te bewerken.

De Curator heeft de responsive varianten live vergeleken en opnieuw **Splitscreen** gekozen. Het breakpoint
verandert alleen de ordening, niet het werkproces:

1. De actieve Foto staat groot in beeld; een horizontale filmstrip en vorige/volgende-acties laten direct
   springen. De bestaande sneltoetsen uit ADR-0014 blijven voor desktop gelden.
2. Oriëntatie-acties liggen op de Foto. Beschrijving, Suggestie en Locatie staan samen in de editor. Een
   Suggestie blijft visueel apart; pas overnemen of bewerken maakt haar onderdeel van het Concept.
3. Conceptwijzigingen worden automatisch duurzaam bewaard. De status wisselt zichtbaar tussen bewaren en
   bewaard, zonder een tweede opslaanknop.
4. **Goedkeuren en verder** accepteert eerst duurzaam één Goedkeuringsopdracht en navigeert daarna meteen
   naar de volgende open Foto. De technische JPEG-write loopt door en blijft zichtbaar in voortgang en
   filmstrip; navigeren annuleert haar niet. **Overslaan** schrijft geen metadata.
5. Een versieconflict onderbreekt de huidige Foto niet met een modaal venster. Een blijvende waarschuwing
   toont welke Foto opnieuw moet worden beoordeeld; **Bekijk opnieuw** opent haar bewaarde Concept tegen de
   nieuwe basis. Goedkeuren moet daarna opnieuw.
6. Productbediening op iPhone is minimaal 44 bij 44 px en de onderste actiebalk respecteert de safe area.

## Consequences

- **Token-only is een harde regel.** `styles.css` laadt Kumo vóór Tailwind (`@source` + `@import
  "@cloudflare/kumo/styles/tailwind"` vóór `@import "tailwindcss"`); custom classes via `cn()`. Reviews
  letten op ruwe kleuren / `dark:` als smell.
- **Prototypes zijn wegwerp.** Ze leven in `src/prototypes/**` + `src/routes/prototypes/**` en staan in
  `oxlintrc` `ignorePatterns` (net als `spike/**`) — de strenge app-regels (incl. `react-doctor`) gelden er
  niet. Bij promotie naar `src/routes/**` (plan P7) verhuist de gekozen richting mee en gaat hij wél door de
  app-lint/conventies (ADR-0013).
- **Splitscreen is de basis** voor het echte reviewscherm: vaste editor op desktop, verticale stroom op
  iPhone. Focus en Inspecteur blijven alleen vergelijkingsmateriaal.
- Fonts (Manrope/Fraunces) waren al gezet vóór deze keuze; er zijn geen nieuwe font/kleur-keuzes gemaakt —
  alles leunt op Kumo's tokens.

## Status

**Geaccepteerd (2026-06-06), responsive contract bevestigd (2026-09-11).** `@cloudflare/kumo` in
`web/package.json`; prototypes gebouwd en live vergeleken; Splitscreen gekozen. Promotie naar het echte
scherm = plan P7.
