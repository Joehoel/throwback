# Toetsenbordsneltoetsen voor het reviewscherm via @tanstack/react-hotkeys

Het reviewscherm van de **Beheer-webapp** krijgt volwaardige toetsenbordbediening, geïmplementeerd met
**`@tanstack/react-hotkeys`**. Dit is besloten tijdens de UX-verkenning (drie aanklikbare prototypes onder
`web/src/routes/prototypes/`): de **Splitscreen**-richting — foto links, bewerkpaneel rechts, filmstrip
onderaan — is gekozen als leidende richting, juist omdat hij zich leent voor doorlopen-op-tempo. Sneltoetsen
zijn daar de bekroning: dad loopt duizenden foto's na, en zonder muis is dat aanzienlijk sneller.

De sneltoetsen leven nu in `web/src/prototypes/Splitscreen.tsx` (wegwerp-prototype, lint-genegeerd net als
`spike/**`). Deze ADR legt de bibliotheekkeuze en de niet-triviale valkuilen vast, zodat ze bij promotie naar
de echte app meekomen en niet opnieuw uitgezocht hoeven te worden.

## Keymap

| Toets | Actie |
| --- | --- |
| `←` / `→` | Vorige / volgende foto |
| `[` / `]` | Vorige / volgende gebeurtenis |
| `Mod+Enter` | Opslaan en volgende — **werkt ook tijdens typen in de beschrijving** |
| `R` | Scheve scan rechtzetten (alleen als de foto scheef staat) |
| `A` | AI-suggestie overnemen in de beschrijving |
| `Shift+/` (`?`) | Sneltoetsenoverzicht tonen/verbergen |

## Considered Options

- **`@tanstack/react-hotkeys`** (gekozen): de app is al volledig TanStack-native (Start, Router, Query, Store),
  dus in dit ecosysteem blijven is consistent. Concrete winstpunten die de doorslag gaven:
  - **Slimme `ignoreInputs`-defaults.** Enkele toetsen en Shift/Alt-combo's worden onderdrukt zodra een
    tekstveld focus heeft; Ctrl/Meta-combo's en `Escape` vuren juist wél. Dít is precies wat `Mod+Enter`
    ("opslaan en volgende") laat werken midden in een zin, terwijl het typen van `r` of `a` gewoon tekst
    blijft. De kerninteractie van tempo-review valt zo gratis op z'n plek, zonder per-toets `enabled`-logica.
  - **Singleton hotkey-manager, geen provider nodig.** `useHotkeys` registreert tegen één manager, dus
    sneltoetsen mogen over meerdere componenten verdeeld worden: navigatie + rotatie in `Splitscreen`,
    de beschrijvings-afhankelijke toetsen (`Mod+Enter`, `A`) in `ReviewPanel` waar de concept-tekst leeft.
    Partitioneren op toets voorkomt dubbel afvuren.
  - **Cross-platform `Mod`** (⌘ op macOS, Ctrl op Windows/Linux) en **SSR-vriendelijk** — past op TanStack
    Start met server-rendering.
- **`react-hotkeys-hook`**: volwassener en populair, maar buiten het TanStack-ecosysteem en zonder de
  cross-platform `Mod`-abstractie out of the box. Geen reden om af te wijken nu er een TanStack-optie is.
- **Zelf een `keydown`-listener**: minste afhankelijkheden, maar we zouden de `ignoreInputs`-heuristiek,
  cross-platform modifiers en match-logica met de hand herbouwen — precies de dingen die de bibliotheek goed
  doet. Verworpen als nodeloos wiel.

## Consequences

- **Alpha-afhankelijkheid.** `@tanstack/react-hotkeys` (v0.10) is door TanStack als alpha bestempeld. Voor een
  prototype prima; bij promotie naar productie de versie pinnen en de release-status herijken.
- **Valkuil — `?` moet als `Shift+/` gebonden worden.** De matcher eist exacte modifier-gelijkheid
  (`event.shiftKey === parsed.shift`). De binding `"?"` parseert naar key `?` met `shift=false`, terwijl de
  fysieke toets `Shift` ingedrukt heeft → **matcht nooit**. `"Shift+/"` matcht wél: via de `event.code`-fallback
  (`Slash` → `/` in `PUNCTUATION_CODE_MAP`) bij ingedrukte Shift. Algemene les: **bind shift-leestekens op de
  fysieke combinatie, niet op het resulterende teken** (geldt ook voor `Shift+1` → `!` enz.).
- **Toegankelijkheid.** Knoppen dragen `aria-keyshortcuts` en het overzicht (de `?`-dialog) somt alle toetsen
  op, met platform-neutrale labels (`⌘/Ctrl`) om SSR/hydratie-afwijking te vermijden. Het overzicht is óók via
  een zichtbare knop bereikbaar, zodat de functie niet alleen achter een sneltoets verstopt zit.
- **Bij promotie.** De keymap, de partitionering over componenten en de `Shift+/`-noot verhuizen mee naar het
  echte reviewscherm; de mock-flow eronder wordt vervangen door de oRPC/D1/Workflow-paden (ADR-0009/0011).

## Status

**Geaccepteerd voor het prototype (2026-06-06).** Geïmplementeerd in `web/src/prototypes/Splitscreen.tsx`;
`@tanstack/react-hotkeys` toegevoegd aan `web/package.json`. Herijken (versie pinnen, alpha-status) bij het
promoveren van het Splitscreen-prototype naar het echte reviewscherm.
