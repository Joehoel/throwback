# Kaart-UI via @vis.gl/react-google-maps; geocoding-key-strategie

De **Locatie**-UI van het reviewscherm (ADR-0008) gebruikt **`@vis.gl/react-google-maps`**: een Google-kaart
met een **sleepbare pin** (`AdvancedMarker` + `onDragEnd`), **Places Autocomplete** op het tekstveld, en
**reverse-geocode** bij slepen. Dit is de concrete invulling van ADR-0008's "handmatige invoer = Places
Autocomplete; draggable pin op de Google Maps JS API".

## Considered Options

- **`@vis.gl/react-google-maps`** (gekozen): officiële React-wrapper voor de Maps JS API; declaratieve
  `<APIProvider>/<Map>/<AdvancedMarker>` en `useMapsLibrary("places"|"geocoding")` om sub-libraries lazy te
  laden. Sluit aan op de bestaande React 19-stack.
- **Kale Google Maps JS API**: meer imperatief lijmwerk, geen reden naast de wrapper.
- **Leaflet / OpenStreetMap**: gratis/geen key, maar geen Places Autocomplete en zwakkere geocoding;
  ADR-0008 leunt expliciet op Google Geocoding voort. Verworpen.

**Geocoding-key-strategie:**
- **Prototype**: forward- én reverse-geocoding gebeurt **client-side** via de Maps JS `Geocoder`, met de
  **browser-key** (`VITE_GOOGLE_MAPS_API_KEY`, HTTP-referrer-restricted). Eén key, geen server-call.
- **Productie**: zoals ADR-0008 — een **aparte, server-restricted key** voor server-side geocoding (de
  AI-plaatsnaam → lat/lon stap draait dan in de Worker, naast de Gemini-call). De browser-key blijft alleen
  voor Maps JS + Places Autocomplete.

## Consequences

- **Twee keys uiteindelijk.** Browser-key (referrer-restricted, client) + server-key (IP/unrestricted,
  Worker). De referrer-restricted browser-key wérkt niet server-side — vandaar de splitsing. In het
  prototype is alleen de browser-key nodig.
- **`AdvancedMarker` vereist een `mapId`**; in dev gebruiken we Google's `"DEMO_MAP_ID"`.
- **Nette fallback zonder key.** `LocationSection` valt terug op een statische kaart-placeholder + gewoon
  tekstveld als `VITE_GOOGLE_MAPS_API_KEY` ontbreekt, zodat het prototype blijft werken.
- **Env-bedrading.** De browser-key komt via Vite's `import.meta.env.VITE_*` (uit `.env.local`), niet via de
  Worker-env — los van de server-secrets (zie [[0018]]). Vereist de **Maps JavaScript API**, **Places API**
  en **Geocoding API** ingeschakeld + referrer-restrictie die `http://localhost:3000/*` toelaat.
- De **AI-plaatsnaam-suggestie** (ADR-0008/[[0018]]) wordt in het prototype óók client-side geocodeerd:
  Gemini geeft de naam, één klik geocodet 'm en verzet de pin.

## Status

**Geaccepteerd (2026-06-06).** `@vis.gl/react-google-maps` in `web/package.json`; kaart + sleepbare pin +
Autocomplete werkend in het Splitscreen-prototype met een echte browser-key. De prod-geocoding-key +
server-side flow volgt in plan P4/P7.
