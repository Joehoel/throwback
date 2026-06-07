/**
 * Location picker for the review screen (ADR-0008 / ADR-0017). With a browser
 * Maps key in `VITE_GOOGLE_MAPS_API_KEY` it lazy-loads the real Google Maps
 * subtree (draggable pin + Places Autocomplete); with no key it falls back to a
 * light static placeholder so the prototype still runs and the Maps bundle never
 * ships. Reverse/forward geocoding runs client-side here for the demo; in
 * production the AI place-name → lat/lng geocode runs server-side (ADR-0008).
 */
import { Suspense, lazy } from "react";
import { Button, Input } from "@cloudflare/kumo";
import { MapPinIcon } from "@phosphor-icons/react";
import { AiPlaceChip } from "#/domains/curation/components/ai-place-chip.tsx";
import { MapMock } from "#/domains/curation/components/map-mock.tsx";
import type { LatLng } from "#/domains/curation/data.ts";

const rawKey: unknown = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAPS_KEY = typeof rawKey === "string" && rawKey !== "" ? rawKey : undefined;

// Heavy: @vis.gl/react-google-maps + the Maps JS API. Only pulled in when a key
// is set, and never on the server (the picker is client-only).
const LocationMapPanel = lazy(() => import("#/domains/curation/components/location-map.tsx"));

export interface Viewport {
  lat: number;
  lng: number;
  z?: number;
}

interface Props {
  place: string;
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
  /** Gemini's place-name guess (ADR-0008); shown as an apply-able chip. */
  aiPlace?: string | null;
  /** Optional explicit "apply to whole event" action. */
  onApply?: () => void;
  /** Map viewport from the URL (ADR-0017); when set, drives the camera. */
  viewport?: Viewport;
  /** Called on user pan/zoom end so the caller can write it to the URL. */
  onViewport?: (v: Viewport) => void;
}

const MAP_PLACEHOLDER = "min-h-28 w-full flex-1";

function ApplyButton({ onApply }: { onApply: () => void }): React.ReactNode {
  return (
    <Button size="sm" variant="secondary" icon={<MapPinIcon />} onClick={onApply}>
      Toepassen
    </Button>
  );
}

export function LocationSection({
  place,
  coords,
  onChange,
  aiPlace,
  onApply,
  viewport,
  onViewport,
}: Props): React.ReactNode {
  const showAi = typeof aiPlace === "string" && aiPlace !== "" && aiPlace !== place;

  if (MAPS_KEY === undefined) {
    return (
      <>
        {showAi ? (
          <AiPlaceChip
            label={aiPlace}
            onApply={() => {
              onChange(aiPlace, coords);
            }}
          />
        ) : null}
        <div className="flex gap-2">
          <Input
            value={place}
            onChange={(e) => {
              onChange(e.target.value, coords);
            }}
            placeholder="Plaats of adres"
            aria-label="Locatie"
            size="sm"
            className="w-full"
          />
          {onApply ? <ApplyButton onApply={onApply} /> : null}
        </div>
        <MapMock place={place} className={MAP_PLACEHOLDER} />
      </>
    );
  }

  const apiKey = MAPS_KEY;
  return (
    <Suspense fallback={<MapMock place={place} className={MAP_PLACEHOLDER} />}>
      <LocationMapPanel
        apiKey={apiKey}
        place={place}
        coords={coords}
        onChange={onChange}
        aiPlace={aiPlace}
        onApply={onApply}
        viewport={viewport}
        onViewport={onViewport}
      />
    </Suspense>
  );
}
