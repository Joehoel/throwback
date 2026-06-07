import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "#/lib/cn.ts";
import { FOCUS_RING } from "#/domains/curation/components/focus-ring.ts";
import { photoDone } from "#/domains/curation/data.ts";
import { useReview } from "#/domains/curation/components/review/review-provider.tsx";

/** Horizontal thumbnail strip for jumping between photos in the event. */
export function Filmstrip(): React.ReactNode {
  const { event, photo, pickPhoto } = useReview();
  const { photos } = event;
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-kumo-hairline bg-kumo-elevated p-2">
      {photos.map((p, i) => {
        const done = photoDone(p);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              pickPhoto(p.id);
            }}
            aria-current={p.id === photo.id ? "true" : undefined}
            aria-label={`Foto ${i + 1} van ${photos.length}${done ? ", klaar" : ""}`}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all",
              p.id === photo.id ? "ring-kumo-brand" : "ring-transparent hover:ring-kumo-line",
              FOCUS_RING,
            )}
          >
            <img
              src={`https://picsum.photos/seed/${p.seed}/120/120`}
              alt=""
              className="h-full w-full object-cover"
            />
            {done ? (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-kumo-success text-kumo-badge-inverted"
              >
                <CheckIcon size={10} weight="bold" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
