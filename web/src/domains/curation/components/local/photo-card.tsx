import {
  CheckCircleIcon,
  ImageIcon,
  MapPinIcon,
  NoteIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";
import { Effect } from "effect";
import { useEffect, useState } from "react";
import { PhotoSource } from "#/domains/local/source.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo, ReviewStatus } from "#/domains/shared/photo.ts";
import { LocalRuntime } from "#/effect/client-runtime.ts";
import { cn } from "#/lib/cn.ts";

/** A photo thumbnail + metadata badges; click to select it for editing. */

// Read a photo's bytes via the client runtime. (Effect.flatMap on the service tag
// rather than `.use`, which the react-hooks lint mistakes for React's `use` hook.)
const readPhotoFile = (photoId: DriveItemId): Promise<File> =>
  LocalRuntime.runPromise(Effect.flatMap(PhotoSource, (source) => source.getFile(photoId)));

/** Re-open a photo's bytes as an object URL, revoking it on unmount/change. */
function useObjectUrl(photoId: DriveItemId): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    const load = async (): Promise<void> => {
      try {
        const file = await readPhotoFile(photoId);
        if (active) {
          created = URL.createObjectURL(file);
          setUrl(created);
        }
      } catch {
        // a missing/unreadable handle just leaves the placeholder
      }
    };
    void load();
    return () => {
      active = false;
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [photoId]);
  return url;
}

function StatusBadge({ status }: { status: ReviewStatus }): React.ReactNode {
  if (status === "handled") {
    return (
      <CheckCircleIcon
        size={12}
        weight="fill"
        className="shrink-0 text-kumo-success"
        aria-label="gereviewd"
      />
    );
  }
  if (status === "skipped") {
    return (
      <ProhibitIcon size={12} className="shrink-0 text-kumo-subtle" aria-label="overgeslagen" />
    );
  }
  return null;
}

export function PhotoCard({
  photo,
  status,
  selected,
  onSelect,
}: {
  photo: Photo;
  status: ReviewStatus;
  selected: boolean;
  onSelect: () => void;
}): React.ReactNode {
  const url = useObjectUrl(photo.id);
  return (
    <button type="button" onClick={onSelect} className="flex w-full flex-col gap-1.5 text-left">
      <div
        className={cn(
          "flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-kumo-recessed ring-1",
          selected ? "ring-2 ring-kumo-link" : "ring-kumo-hairline",
        )}
      >
        {url === null ? (
          <ImageIcon size={24} className="text-kumo-subtle" aria-hidden />
        ) : (
          <img
            src={url}
            alt={photo.description ?? photo.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <span className="flex items-center gap-1.5 text-xs text-kumo-subtle">
        <StatusBadge status={status} />
        <span className="min-w-0 flex-1 truncate" title={photo.name}>
          {photo.name}
        </span>
        {photo.year === null ? null : <span className="shrink-0">{photo.year}</span>}
        {photo.location === null ? null : (
          <MapPinIcon size={12} className="shrink-0 text-kumo-success" aria-label="heeft locatie" />
        )}
        {photo.description === null ? null : (
          <NoteIcon
            size={12}
            className="shrink-0 text-kumo-success"
            aria-label="heeft beschrijving"
          />
        )}
      </span>
    </button>
  );
}
