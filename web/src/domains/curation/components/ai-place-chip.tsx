import { Text } from "@cloudflare/kumo";
import { SparkleIcon } from "@phosphor-icons/react";
import { cn } from "#/lib/cn.ts";
import { FOCUS_RING } from "#/domains/curation/components/focus-ring.ts";

interface AiPlaceChipProps {
  /** the AI-suggested place name to show and apply */
  label: string;
  onApply: () => void;
}

/**
 * Apply-able chip for Gemini's place-name guess (ADR-0008). Presentational only —
 * the caller decides what "apply" does (geocode, or set the field directly).
 */
export function AiPlaceChip({ label, onApply }: AiPlaceChipProps): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onApply}
      className={cn(
        "flex items-center gap-1.5 rounded-lg bg-kumo-recessed p-2 text-left transition-colors hover:bg-kumo-fill",
        FOCUS_RING,
      )}
    >
      <SparkleIcon size={14} weight="fill" className="shrink-0 text-kumo-link" />
      <Text variant="secondary" size="sm">
        AI-locatie: <span className="text-kumo-default">{label}</span> — gebruiken
      </Text>
    </button>
  );
}
