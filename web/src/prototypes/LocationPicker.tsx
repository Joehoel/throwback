/**
 * Location picker for the Splitscreen prototype — the real map, per ADR-0008 /
 * the stack choice: Google Maps via @vis.gl/react-google-maps, a draggable pin,
 * and Places Autocomplete on the text field.
 *
 * Needs a browser Maps key in `VITE_GOOGLE_MAPS_API_KEY` (web/.env.local). With
 * no key set it falls back to the static placeholder so the prototype still
 * runs. Reverse-geocoding the dragged pin happens client-side here for the demo;
 * in production the AI place-name → lat/lng geocode runs server-side with a
 * separate, server-restricted key (see the design doc / ADR-0008).
 */
import { useEffect, useRef } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Button, Input, Text } from "@cloudflare/kumo";
import { MapPinIcon, SparkleIcon } from "@phosphor-icons/react";
import type { LatLng } from "./data";
import { MapMock } from "./shared";

const MAPS_KEY = (import.meta.env as Record<string, string | undefined>)
  .VITE_GOOGLE_MAPS_API_KEY;

export interface Viewport {
  lat: number;
  lng: number;
  z?: number;
}

interface Props {
  place: string;
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
  /** Gemini's place-name guess (ADR-0008). Shown as an apply-able chip; the
   *  client geocodes the name to lat/lon when applied. */
  aiPlace?: string | null;
  /** Optional explicit "apply to whole event" button (omitted when location is
   *  committed on approve, as in the machine-driven version). */
  onApply?: () => void;
  /** Map viewport from the URL (ADR-0017); when set, drives the map camera. */
  viewport?: Viewport;
  /** Called on user pan/zoom end so the caller can write it to the URL (replace). */
  onViewport?: (v: Viewport) => void;
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
  const showAi = aiPlace != null && aiPlace !== "" && aiPlace !== place;

  if (!MAPS_KEY) {
    return (
      <>
        {showAi && (
          <button
            type="button"
            onClick={() => onChange(aiPlace, coords)}
            className="flex items-center gap-1.5 rounded-lg bg-kumo-recessed p-2 text-left transition-colors hover:bg-kumo-fill"
          >
            <SparkleIcon size={14} weight="fill" className="shrink-0 text-kumo-link" />
            <Text variant="secondary" size="sm">
              AI-locatie: <span className="text-kumo-default">{aiPlace}</span> — gebruiken
            </Text>
          </button>
        )}
        <div className="flex gap-2">
          <Input
            value={place}
            onChange={(e) => onChange(e.target.value, coords)}
            placeholder="Plaats of adres"
            aria-label="Locatie"
            size="sm"
            className="w-full"
          />
          {onApply && <ApplyButton onApply={onApply} />}
        </div>
        <MapMock place={place} className="min-h-28 w-full flex-1" />
      </>
    );
  }

  return (
    <APIProvider apiKey={MAPS_KEY}>
      {showAi && <AiLocationSuggestion suggestion={aiPlace} coords={coords} onChange={onChange} />}
      <div className="flex gap-2">
        <AutocompleteInput value={place} coords={coords} onChange={onChange} />
        {onApply && <ApplyButton onApply={onApply} />}
      </div>
      <LocationMap coords={coords} onChange={onChange} viewport={viewport} onViewport={onViewport} />
    </APIProvider>
  );
}

/** Apply Gemini's place-name guess: forward-geocode it to lat/lon (Maps JS) and
 *  move the pin. Lives inside APIProvider so the geocoding library is available. */
function AiLocationSuggestion({
  suggestion,
  coords,
  onChange,
}: {
  suggestion: string;
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
}): React.ReactNode {
  const geocodingLib = useMapsLibrary("geocoding");
  const apply = (): void => {
    if (!geocodingLib) {
      onChange(suggestion, coords);
      return;
    }
    const geocoder = new geocodingLib.Geocoder();
    void geocoder.geocode({ address: suggestion }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        onChange(results[0].formatted_address ?? suggestion, { lat: loc.lat(), lng: loc.lng() });
      } else {
        onChange(suggestion, coords);
      }
    });
  };
  return (
    <button
      type="button"
      onClick={apply}
      className="flex items-center gap-1.5 rounded-lg bg-kumo-recessed p-2 text-left transition-colors hover:bg-kumo-fill"
    >
      <SparkleIcon size={14} weight="fill" className="shrink-0 text-kumo-link" />
      <Text variant="secondary" size="sm">
        AI-locatie: <span className="text-kumo-default">{suggestion}</span> — gebruiken
      </Text>
    </button>
  );
}

function ApplyButton({ onApply }: { onApply: () => void }): React.ReactNode {
  return (
    <Button size="sm" variant="secondary" icon={<MapPinIcon />} onClick={onApply}>
      Toepassen
    </Button>
  );
}

function LocationMap({
  coords,
  onChange,
  viewport,
  onViewport,
}: {
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
  viewport?: Viewport;
  onViewport?: (v: Viewport) => void;
}): React.ReactNode {
  const geocodingLib = useMapsLibrary("geocoding");
  // User-driven camera changes only (dragend/zoom) → no loop with the
  // programmatic panTo in MapRecenter, which fires center_changed instead.
  const syncCamera = onViewport
    ? (ev: { detail: { center: { lat: number; lng: number }; zoom: number } }): void =>
        onViewport({ lat: ev.detail.center.lat, lng: ev.detail.center.lng, z: ev.detail.zoom })
    : undefined;

  function handleDragEnd(e: google.maps.MapMouseEvent): void {
    const ll = e.latLng;
    if (!ll) return;
    const next: LatLng = { lat: ll.lat(), lng: ll.lng() };
    const fallback = `${next.lat.toFixed(4)}, ${next.lng.toFixed(4)}`;
    if (!geocodingLib) {
      onChange(fallback, next);
      return;
    }
    const geocoder = new geocodingLib.Geocoder();
    void geocoder.geocode({ location: next }, (results, status) => {
      const label =
        status === "OK" && results && results[0] ? results[0].formatted_address : fallback;
      onChange(label, next);
    });
  }

  return (
    <div className="min-h-28 w-full flex-1 overflow-hidden rounded-xl ring-1 ring-kumo-hairline">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultZoom={viewport?.z ?? 9}
        defaultCenter={viewport ? { lat: viewport.lat, lng: viewport.lng } : coords}
        gestureHandling="greedy"
        disableDefaultUI
        className="h-full w-full"
        onDragend={syncCamera}
        onZoomChanged={syncCamera}
      >
        <AdvancedMarker position={coords} draggable onDragEnd={handleDragEnd} />
        <MapRecenter coords={coords} />
      </GoogleMap>
    </div>
  );
}

/** Pan the map when the point changes (event switch or autocomplete pick). */
function MapRecenter({ coords }: { coords: LatLng }): React.ReactNode {
  const map = useMap();
  useEffect(() => {
    if (map) map.panTo(coords);
  }, [map, coords.lat, coords.lng]);
  return null;
}

function AutocompleteInput({
  value,
  coords,
  onChange,
}: {
  value: string;
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
}): React.ReactNode {
  const places = useMapsLibrary("places");
  const wrapRef = useRef<HTMLDivElement>(null);
  // Latest onChange via ref so the widget is bound once (not re-created every
  // render, which would stack listeners and duplicate the suggestions dropdown).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!places || !wrapRef.current) return;
    const input = wrapRef.current.querySelector("input");
    if (!input) return;
    // Classic Autocomplete widget bound to the Kumo input — keeps the styled
    // field while Google handles suggestions. (Prod may move to the newer
    // PlaceAutocompleteElement; fine for the prototype.)
    const ac = new places.Autocomplete(input, {
      fields: ["geometry", "formatted_address", "name"],
    });
    const listener = ac.addListener("place_changed", () => {
      const p = ac.getPlace();
      const loc = p.geometry?.location;
      const label = p.formatted_address ?? p.name ?? input.value;
      if (loc) onChangeRef.current(label, { lat: loc.lat(), lng: loc.lng() });
    });
    return () => listener.remove();
  }, [places]);

  return (
    <div ref={wrapRef} className="min-w-0 flex-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value, coords)}
        placeholder="Plaats of adres"
        aria-label="Locatie"
        size="sm"
        className="w-full"
      />
    </div>
  );
}
