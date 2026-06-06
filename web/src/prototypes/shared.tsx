/**
 * Small presentational helpers shared by the prototypes. Strictly Kumo tokens
 * (`bg-kumo-*`, `text-kumo-*`, `border-kumo-*`) — no raw colors, no `dark:`.
 */
import { Link } from "@tanstack/react-router";
import { Badge, Text } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  MapPinIcon,
  MapTrifoldIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { type Photo, type ThrowbackEvent, photoSrc } from "./data";

/** Photo with rounded frame; honours a (mock) rotation correction. */
export function PhotoView({
  photo,
  rotated = false,
  className = "",
  longEdge = 1200,
}: {
  photo: Photo;
  /** when true, show the "corrected" orientation (visual tilt undone) */
  rotated?: boolean;
  className?: string;
  longEdge?: number;
}): React.ReactNode {
  // Mock: an uncorrected scan that "needs rotation" is shown slightly tilted;
  // applying the fix removes the tilt. Purely to make the control feel real.
  const tilt = photo.needsRotation && !rotated ? "rotate-3" : "rotate-0";
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl bg-kumo-recessed ring-1 ring-kumo-hairline ${className}`}
    >
      <img
        src={photoSrc(photo, longEdge)}
        alt={photo.aiDescription}
        className={`max-h-full max-w-full object-contain transition-transform duration-300 ${tilt}`}
      />
    </div>
  );
}

/** Placeholder for the Google Map (real app: @vis.gl/react-google-maps). */
export function MapMock({
  place,
  className = "",
}: {
  place: string;
  className?: string;
}): React.ReactNode {
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-kumo-recessed ring-1 ring-kumo-hairline ${className}`}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-kumo-hairline) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, var(--color-kumo-hairline) 0 1px, transparent 1px 32px)",
        }}
        aria-hidden
      />
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

/** Compact status chips for one photo (description / location / rotation). */
export function PhotoStatus({
  photo,
  event,
}: {
  photo: Photo;
  event: ThrowbackEvent;
}): React.ReactNode {
  const hasLocation = event.location !== null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {photo.description ? (
        <Badge variant="success" appearance="dot">
          Beschrijving
        </Badge>
      ) : (
        <Badge variant="neutral" appearance="dot">
          Geen beschrijving
        </Badge>
      )}
      {hasLocation ? (
        <Badge variant="success" appearance="dot">
          Locatie
        </Badge>
      ) : (
        <Badge variant="warning" appearance="dot">
          Geen locatie
        </Badge>
      )}
      {photo.needsRotation && !photo.rotationFixed && (
        <Badge variant="orange">Scheef</Badge>
      )}
    </div>
  );
}

export function DoneIcon(): React.ReactNode {
  return <CheckCircleIcon size={20} weight="fill" className="text-kumo-success" />;
}

export function TodoIcon(): React.ReactNode {
  return <WarningCircleIcon size={20} weight="fill" className="text-kumo-warning" />;
}

/** Keyboard-cap badge. Platform-neutral labels (no SSR/hydration drift). */
export function Kbd({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-kumo-line bg-kumo-recessed px-1.5 font-sans text-[11px] font-medium leading-none text-kumo-subtle">
      {children}
    </kbd>
  );
}

/** Back link used in every prototype's header to return to the chooser. */
export function BackToHub(): React.ReactNode {
  return (
    <Link
      to="/prototypes"
      className="inline-flex items-center gap-1.5 text-sm text-kumo-subtle hover:text-kumo-default"
    >
      <ArrowLeftIcon size={16} />
      Alle prototypes
    </Link>
  );
}
