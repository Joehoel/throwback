import { FolderIcon } from "@phosphor-icons/react";
import { PhotoCard } from "#/domains/curation/components/local/photo-card.tsx";
import type { FolderNode } from "#/domains/local/folder-tree.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo, ReviewStatus } from "#/domains/shared/photo.ts";

/** The current folder's sub-folders and its photos. Selection/navigation bubble up. */
export function FolderGrid({
  folder,
  photosById,
  statuses,
  selectedId,
  onNavigate,
  onSelect,
}: {
  folder: FolderNode;
  photosById: ReadonlyMap<DriveItemId, Photo>;
  statuses: ReadonlyMap<DriveItemId, ReviewStatus>;
  selectedId: DriveItemId | null;
  onNavigate: (id: DriveItemId) => void;
  onSelect: (photo: Photo) => void;
}): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      {folder.children.length > 0 ? (
        <section aria-label="Submappen" className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-kumo-subtle">Mappen</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {folder.children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(child.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-kumo-recessed p-3 text-left ring-1 ring-kumo-hairline transition-colors hover:bg-kumo-hover"
                >
                  <FolderIcon size={20} className="shrink-0 text-kumo-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-kumo-default">
                    {child.name}
                  </span>
                  <span className="shrink-0 text-xs text-kumo-subtle">{child.photoCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Foto’s" className="flex flex-col gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-kumo-subtle">
          Foto’s in deze map ({folder.photoIds.length})
        </h2>
        {folder.photoIds.length === 0 ? (
          <p className="text-sm text-kumo-subtle">Geen foto’s direct in deze map.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {folder.photoIds.map((id) => {
              const photo = photosById.get(id);
              return photo === undefined ? null : (
                <li key={id}>
                  <PhotoCard
                    photo={photo}
                    status={statuses.get(id) ?? photo.reviewStatus}
                    selected={id === selectedId}
                    onSelect={() => {
                      onSelect(photo);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
