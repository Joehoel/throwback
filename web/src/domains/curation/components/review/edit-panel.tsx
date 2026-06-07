import { Button, InputArea, Loader, Text } from "@cloudflare/kumo";
import { SparkleIcon } from "@phosphor-icons/react";
import { cn } from "#/lib/cn.ts";
import { FOCUS_RING } from "#/domains/curation/components/focus-ring.ts";
import { Kbd } from "#/domains/curation/components/kbd.tsx";
import { LocationSection } from "#/domains/curation/components/location-picker.tsx";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

/** Side panel: AI-assisted description editing and the location picker. */
export function EditPanel(): React.ReactNode {
  const {
    description,
    suggestion,
    suggesting,
    place,
    coords,
    aiPlaceSuggestion,
    viewport,
    applySuggestion,
    setDescription,
    changeLocation,
    setViewport,
  } = useReview();

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-auto border-t border-kumo-hairline lg:w-96 lg:border-l lg:border-t-0">
      <div className="flex min-h-full flex-col gap-3 p-4">
        <Text as="h2" bold>
          Bewerken
        </Text>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Text as="h3" bold size="sm">
              Beschrijving
            </Text>
            <Button
              size="xs"
              variant="ghost"
              icon={<SparkleIcon />}
              disabled={suggesting}
              onClick={() => {
                applySuggestion();
              }}
            >
              AI-suggestie <Kbd>A</Kbd>
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!suggesting) {
                applySuggestion();
              }
            }}
            className={cn(
              "flex items-start gap-1.5 rounded-lg bg-kumo-recessed p-2.5 text-left transition-colors hover:bg-kumo-fill",
              FOCUS_RING,
            )}
          >
            {suggesting ? (
              <Loader size="sm" />
            ) : (
              <SparkleIcon size={14} weight="fill" className="mt-0.5 shrink-0 text-kumo-link" />
            )}
            <Text variant="secondary" size="sm">
              {suggestion || "AI denkt na…"}
            </Text>
          </button>
          <InputArea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            placeholder="Beschrijf wat je ziet…"
            className="min-h-20"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <Text as="h3" bold size="sm">
            Locatie
          </Text>
          <LocationSection
            place={place}
            coords={coords}
            aiPlace={aiPlaceSuggestion}
            viewport={viewport}
            onViewport={setViewport}
            onChange={(p, c) => {
              changeLocation(p, c);
            }}
          />
        </div>
      </div>
    </aside>
  );
}
