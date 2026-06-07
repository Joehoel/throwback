import { Button } from "@cloudflare/kumo";
import { CaretRightIcon, FolderIcon, ImageIcon, MapPinIcon, NoteIcon } from "@phosphor-icons/react";
import { Effect } from "effect";
import { useEffect, useMemo, useState } from "react";
import { findFolder } from "#/domains/local/folder-tree.ts";
import type { FolderNode } from "#/domains/local/folder-tree.ts";
import { PhotoSource } from "#/domains/local/source.ts";
import type { IngestResult } from "#/domains/local/source.ts";
import { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import { LocalRuntime } from "#/effect/client-runtime.ts";
import { cn } from "#/lib/cn.ts";

/**
 * Read-only browser over a crawled local folder (phase 1). Navigates the real
 * folder tree, shows each `Photo`'s EXIF-derived metadata, and renders thumbnails
 * from the original bytes as object URLs. The review/edit flow + EXIF write-back
 * arrive in the next phase.
 */

// Read a photo's bytes via the client runtime. (Effect.flatMap on the service tag
// rather than `.use`, which the react-hooks lint mistakes for React's `use` hook.)
const readPhotoFile = (photoId: DriveItemId): Promise<File> =>
  LocalRuntime.runPromise(Effect.flatMap(PhotoSource, (source) => source.getFile(photoId)));

export function Centered({ children }: { children: React.ReactNode }): React.ReactNode {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}

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

function PhotoCard({ photo }: { photo: Photo }): React.ReactNode {
  const url = useObjectUrl(photo.id);
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-kumo-recessed ring-1 ring-kumo-hairline">
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
      <figcaption className="flex items-center gap-1.5 text-xs text-kumo-subtle">
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
      </figcaption>
    </figure>
  );
}

function Breadcrumbs({
  folder,
  onNavigate,
}: {
  folder: FolderNode;
  onNavigate: (id: DriveItemId) => void;
}): React.ReactNode {
  return (
    <nav aria-label="Mappad" className="flex min-w-0 items-center gap-1.5 text-sm">
      <FolderIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
        {folder.path.map((segment, depth) => {
          const id = DriveItemId.make(folder.path.slice(0, depth + 1).join("/"));
          const isCurrent = depth === folder.path.length - 1;
          return (
            <li key={id} className="flex shrink-0 items-center gap-1">
              {depth > 0 ? (
                <CaretRightIcon size={12} className="text-kumo-subtle" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onNavigate(id);
                }}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "rounded px-1.5 py-0.5 hover:bg-kumo-hover",
                  isCurrent ? "font-medium text-kumo-default" : "text-kumo-subtle",
                )}
              >
                {segment}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function FolderBrowser({
  result,
  onPickAgain,
}: {
  result: IngestResult;
  onPickAgain: () => void;
}): React.ReactNode {
  const [folderId, setFolderId] = useState<DriveItemId>(result.root.id);

  const photosById = useMemo(() => {
    const map = new Map<DriveItemId, Photo>();
    for (const photo of result.photos) {
      map.set(photo.id, photo);
    }
    return map;
  }, [result]);

  const folder = findFolder(result.root, folderId) ?? result.root;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <Breadcrumbs folder={folder} onNavigate={setFolderId} />
        <Button variant="ghost" size="sm" onClick={onPickAgain}>
          Andere map
        </Button>
      </header>

      {folder.children.length > 0 ? (
        <section aria-label="Submappen" className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-kumo-subtle">Mappen</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {folder.children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFolderId(child.id);
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
                  <PhotoCard photo={photo} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
