# UI met Cloudflare Kumo; Splitscreen als gekozen reviewscherm-richting

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

## Consequences

- **Token-only is een harde regel.** `styles.css` laadt Kumo vóór Tailwind (`@source` + `@import
  "@cloudflare/kumo/styles/tailwind"` vóór `@import "tailwindcss"`); custom classes via `cn()`. Reviews
  letten op ruwe kleuren / `dark:` als smell.
- **Prototypes zijn wegwerp.** Ze leven in `src/prototypes/**` + `src/routes/prototypes/**` en staan in
  `oxlintrc` `ignorePatterns` (net als `spike/**`) — de strenge app-regels (incl. `react-doctor`) gelden er
  niet. Bij promotie naar `src/routes/**` (plan P7) verhuist de gekozen richting mee en gaat hij wél door de
  app-lint/conventies (ADR-0013).
- **Splitscreen is de basis** voor het echte reviewscherm; de andere twee prototypes blijven staan als
  vergelijkingsmateriaal maar worden niet verder uitgewerkt.
- Fonts (Manrope/Fraunces) waren al gezet vóór deze keuze; er zijn geen nieuwe font/kleur-keuzes gemaakt —
  alles leunt op Kumo's tokens.

## Status

**Geaccepteerd (2026-06-06).** `@cloudflare/kumo` in `web/package.json`; prototypes gebouwd en vergeleken;
Splitscreen gekozen. Promotie naar het echte scherm = plan P7.
