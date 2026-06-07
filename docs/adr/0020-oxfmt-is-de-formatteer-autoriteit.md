# oxfmt is de enige formatteer-autoriteit; conflicterende oxlint-regels gaan uit

`web/` gebruikt **oxlint** (alle categorieën `error`, `denyWarnings`, `reportUnusedDisableDirectives`) én **oxfmt** als formatter. Beide draaien in de lefthook pre-commit: eerst `oxlint --fix`, daarna `oxfmt --write` (beide `stage_fixed`). Daarmee is **oxfmt de laatste schrijver** en de facto de bron van waarheid voor opmaak.

Een lint-regel die opmaak afdwingt die oxfmt tegenspreekt, is daarmee onhoudbaar: de twee tools blijven elkaars werk terugdraaien (ping-pong) en CI-`oxlint` faalt op door oxfmt geformatteerde code.

## Aanleiding (empirisch)

`unicorn/number-literal-case` eist **hoofdletter** hex-cijfers (`0xFF`); oxfmt schrijft **kleine letters** (`0xff`). In de oxc-toolchain is dit niet te verzoenen:

- `unicorn/number-literal-case` is in oxlint 1.68 een `DummyRule` — alleen aan/uit, **geen** optie om kleine letters te kiezen.
- `.oxfmtrc.json` heeft **geen** hex/number-optie — oxfmt normaliseert altijd naar kleine letters.

Geraakt bij de EXIF-`reader.ts` (JPEG-marker-bytes) en de test-fixtures (`reader.test.ts`, `__fixtures__/jpeg.ts`), waar byte-literals onvermijdelijk zijn.

## Besluit

**De formatter bezit de opmaak; de linter bezit correctheid.** oxlint-regels die puur opmaak betreffen en met oxfmt botsen, zetten we **uit** in `.oxlintrc.json` — net zoals `eslint-config-prettier` stylistische ESLint-regels uitschakelt. Concreet nu:

- `unicorn/number-literal-case: "off"` — oxfmt garandeert al consistente (kleine-letter) hex repo-breed, dus de regel is zowel **overbodig** als **conflicterend**.

Toekomstige formatter/linter-conflicten horen hier thuis: regel uit, in deze ADR vermeld met reden. Géén per-bestand `oxlint-disable` of contortie (decimale byte-constanten, hex-in-strings enkel om de regel te ontwijken) — dat verplaatst het probleem in plaats van het op te lossen.

## Considered Options

- **A — Regel uit, oxfmt wint** (gekozen): één bron van waarheid voor opmaak; conventionele lowercase hex-literals werken gewoon.
- **B — oxfmt dwingen tot hoofdletters**: onmogelijk (geen optie).
- **C — Per-bestand `oxlint-disable`**: koppelt de disable aan exacte literals, breekt zodra hex hoofdletter wordt (regel weer "ongebruikt"), en herhaalt zich bij elk nieuw byte-bestand. Verworpen als shortcut.

## Consequences

- Hex-cijfercasing wordt niet meer door oxlint bewaakt; oxfmt normaliseert het bij elke commit, dus consistentie blijft gegarandeerd.
- Byte-zware code (`reader.ts`) gebruikt gewone lowercase hex-literals zonder workaround of disable.
- `.oxlintrc.json` is git-getrackt, dus deze keuze geldt voor het hele team en CI.

## Status

**Vastgesteld (2026-06-07).** `unicorn/number-literal-case` uit; byte-code teruggebracht naar conventionele hex.
