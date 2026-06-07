import { Text } from "@cloudflare/kumo";
import { MapPinIcon, MapTrifoldIcon } from "@phosphor-icons/react";
import { cn } from "#/lib/cn.ts";

// Static grid backdrop — hoisted so it isn't rebuilt each render.
const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(0deg, var(--color-kumo-hairline) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, var(--color-kumo-hairline) 0 1px, transparent 1px 32px)",
};

interface MapMockProps {
  place: string;
  className?: string;
}

/** Placeholder for the Google Map (real app: @vis.gl/react-google-maps). */
export function MapMock({ place, className }: MapMockProps): React.ReactNode {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-kumo-recessed ring-1 ring-kumo-hairline",
        className,
      )}
    >
      <div className="absolute inset-0 opacity-40" style={GRID_STYLE} aria-hidden />
      <MapTrifoldIcon size={28} className="relative text-kumo-subtle" weight="duotone" />
      <div className="relative flex items-center gap-1.5">
        <MapPinIcon size={18} weight="fill" className="text-kumo-link" />
        <Text variant="secondary" size="sm">
          {place}
        </Text>
      </div>
    </div>
  );
}
