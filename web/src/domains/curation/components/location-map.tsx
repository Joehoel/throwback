/// <reference types="google.maps" />
/**
 * The real Google Maps subtree for the location picker (ADR-0017): draggable pin,
 * Places Autocomplete, and client-side reverse/forward geocoding for the demo.
 * Loaded lazily (see location-picker.tsx) so it never enters the initial bundle
 * and the no-key fallback stays light.
 */
import { useEffect, useEffectEvent, useRef } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Button, Input } from "@cloudflare/kumo";
import { MapPinIcon } from "@phosphor-icons/react";
import { AiPlaceChip } from "#/domains/curation/components/ai-place-chip.tsx";
import type { LatLng } from "#/domains/curation/data.ts";
import type { Viewport } from "#/domains/curation/components/location-picker.tsx";

/** Forward-geocode Gemini's place-name guess to lat/lon (Maps JS) and move the pin. */
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
      const first = results?.[0];
      if (status === "OK" && first !== undefined) {
        const loc = first.geometry.location;
        onChange(first.formatted_address, { lat: loc.lat(), lng: loc.lng() });
      } else {
        onChange(suggestion, coords);
      }
    });
  };
  return <AiPlaceChip label={suggestion} onApply={apply} />;
}

function ApplyButton({ onApply }: { onApply: () => void }): React.ReactNode {
  return (
    <Button size="sm" variant="secondary" icon={<MapPinIcon />} onClick={onApply}>
      Toepassen
    </Button>
  );
}

/** Pan the map when the point changes (event switch or autocomplete pick). */
function MapRecenter({ coords }: { coords: LatLng }): React.ReactNode {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(coords);
    }
  }, [map, coords]);
  return null;
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
  const map = useMap();
  const geocodingLib = useMapsLibrary("geocoding");

  // User-driven camera changes only (dragend/zoom). Read straight from the map
  // instance — properly typed, no dependence on the event's `unknown` detail, and
  // no loop with the programmatic panTo in MapRecenter (that fires center_changed).
  const syncCamera = (): void => {
    if (!map || !onViewport) {
      return;
    }
    const c = map.getCenter();
    if (c) {
      onViewport({ lat: c.lat(), lng: c.lng(), z: map.getZoom() ?? 9 });
    }
  };

  const handleDragEnd = (e: google.maps.MapMouseEvent): void => {
    const ll = e.latLng;
    if (!ll) {
      return;
    }
    const next: LatLng = { lat: ll.lat(), lng: ll.lng() };
    const fallback = `${next.lat.toFixed(4)}, ${next.lng.toFixed(4)}`;
    if (!geocodingLib) {
      onChange(fallback, next);
      return;
    }
    const geocoder = new geocodingLib.Geocoder();
    void geocoder.geocode({ location: next }, (results, status) => {
      const first = results?.[0];
      const label = status === "OK" && first !== undefined ? first.formatted_address : fallback;
      onChange(label, next);
    });
  };

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
  // Latest onChange without re-binding the widget each render (which would stack
  // listeners and duplicate the suggestions dropdown).
  const onPick = useEffectEvent((label: string, next: LatLng) => {
    onChange(label, next);
  });

  useEffect(() => {
    let listener: google.maps.MapsEventListener | undefined;
    const input = wrapRef.current?.querySelector("input");
    if (places && input) {
      // Classic Autocomplete widget bound to the Kumo input — keeps the styled
      // field while Google handles suggestions. (Prod may move to the newer
      // PlaceAutocompleteElement; fine for the prototype.)
      const ac = new places.Autocomplete(input, {
        fields: ["geometry", "formatted_address", "name"],
      });
      listener = ac.addListener("place_changed", () => {
        const p = ac.getPlace();
        const loc = p.geometry?.location;
        const label = p.formatted_address ?? p.name ?? input.value;
        if (loc) {
          onPick(label, { lat: loc.lat(), lng: loc.lng() });
        }
      });
    }
    return () => {
      listener?.remove();
    };
  }, [places]);

  return (
    <div ref={wrapRef} className="min-w-0 flex-1">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value, coords);
        }}
        placeholder="Plaats of adres"
        aria-label="Locatie"
        size="sm"
        className="w-full"
      />
    </div>
  );
}

interface PanelProps {
  apiKey: string;
  place: string;
  coords: LatLng;
  onChange: (place: string, coords: LatLng) => void;
  aiPlace?: string | null;
  onApply?: () => void;
  viewport?: Viewport;
  onViewport?: (v: Viewport) => void;
}

/** APIProvider-wrapped picker. Default export so it can be `React.lazy`-loaded. */
export default function LocationMapPanel({
  apiKey,
  place,
  coords,
  onChange,
  aiPlace,
  onApply,
  viewport,
  onViewport,
}: PanelProps): React.ReactNode {
  const showAi = typeof aiPlace === "string" && aiPlace !== "" && aiPlace !== place;
  return (
    <APIProvider apiKey={apiKey}>
      {showAi ? (
        <AiLocationSuggestion suggestion={aiPlace} coords={coords} onChange={onChange} />
      ) : null}
      <div className="flex gap-2">
        <AutocompleteInput value={place} coords={coords} onChange={onChange} />
        {onApply ? <ApplyButton onApply={onApply} /> : null}
      </div>
      <LocationMap
        coords={coords}
        onChange={onChange}
        viewport={viewport}
        onViewport={onViewport}
      />
    </APIProvider>
  );
}
