import { Button } from "@cloudflare/kumo";
import { useEffect, useMemo, useState } from "react";
import {
  fetchReviewStatuses,
  mergeReviewStatuses,
  setReviewStatus,
  toApproveEdit,
  writePhoto,
} from "#/domains/curation/components/local/actions.ts";
import { BreadcrumbsNav } from "#/domains/curation/components/local/breadcrumbs-nav.tsx";
import { EditPanel } from "#/domains/curation/components/local/edit-panel.tsx";
import { FolderGrid } from "#/domains/curation/components/local/folder-grid.tsx";
import { findFolder } from "#/domains/local/folder-tree.ts";
import type { IngestResult } from "#/domains/local/source.ts";
import type { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo, ReviewStatus } from "#/domains/shared/photo.ts";

/**
 * Browser over a crawled local folder with the phase-2 review/edit flow: navigate
 * the folder tree (`FolderGrid` + `BreadcrumbsNav`), pick a photo, edit its
 * Beschrijving and approve/skip (`EditPanel`). Approve writes the description back
 * into the file (`writePhoto` → XMP + EXIF) and records the review status in D1
 * (`actions`); statuses are hydrated on load. Orchestration only — display lives in
 * the child components.
 */

export function Centered({ children }: { children: React.ReactNode }): React.ReactNode {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}

export function FolderBrowser({
  result,
  onPickAgain,
}: {
  result: IngestResult;
  onPickAgain: () => void;
}): React.ReactNode {
  const [folderId, setFolderId] = useState<DriveItemId>(result.root.id);
  const [selectedId, setSelectedId] = useState<DriveItemId | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ReadonlyMap<DriveItemId, ReviewStatus>>(new Map());

  const photosById = useMemo(() => {
    const map = new Map<DriveItemId, Photo>();
    for (const photo of result.photos) {
      map.set(photo.id, photo);
    }
    return map;
  }, [result]);

  // Hydrate the crawled photos with their persisted (D1) review status.
  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const recorded = await fetchReviewStatuses();
        if (active) {
          setStatuses(mergeReviewStatuses(result.photos, recorded));
        }
      } catch {
        // no server / not migrated yet → fall back to the crawl defaults
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [result]);

  const folder = findFolder(result.root, folderId) ?? result.root;
  const selected = selectedId === null ? null : (photosById.get(selectedId) ?? null);

  const select = (photo: Photo): void => {
    setErrorMessage(null);
    setSelectedId(photo.id);
    setDescription(photo.description ?? "");
  };

  const finishReview = async (
    photo: Photo,
    status: ReviewStatus,
    write?: () => Promise<void>,
  ): Promise<void> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (write !== undefined) {
        await write();
      }
      await setReviewStatus({ data: { path: photo.id, status } });
      setStatuses((previous) => new Map(previous).set(photo.id, status));
      setSelectedId(null);
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <BreadcrumbsNav folder={folder} onNavigate={setFolderId} />
        <Button variant="ghost" size="sm" onClick={onPickAgain}>
          Andere map
        </Button>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FolderGrid
          folder={folder}
          photosById={photosById}
          statuses={statuses}
          selectedId={selectedId}
          onNavigate={setFolderId}
          onSelect={select}
        />

        {selected === null ? null : (
          <div className="flex flex-col gap-2 lg:w-96 lg:shrink-0">
            <EditPanel
              photo={selected}
              description={description}
              busy={busy}
              onDescription={setDescription}
              onApprove={() => {
                void finishReview(selected, "handled", () =>
                  writePhoto(selected.id, toApproveEdit(selected, description)),
                );
              }}
              onSkip={() => {
                void finishReview(selected, "skipped");
              }}
              onClose={() => {
                setSelectedId(null);
              }}
            />
            {errorMessage === null ? null : (
              <p className="text-sm text-kumo-danger">{errorMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
