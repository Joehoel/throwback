import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { domainClient } from "../api/domain-client.ts";
import {
  listLibraryFoldersOptions,
  selectLibraryMutation,
} from "../generated/@tanstack/react-query.gen.ts";
import type { DriveItemId } from "../generated/types.gen.ts";
import { LibraryFolderError } from "./library-folder-error.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";
import { Skeleton } from "./ui/skeleton.tsx";

function folderCount(count: number): string {
  return count === 1 ? "1 onderliggende map" : `${count} onderliggende mappen`;
}

/** Browse the Curator's OneDrive folders and explicitly confirm one Hoofdmap. */
export function LibraryFolderPicker() {
  const queryClient = useQueryClient();
  const [parentFolderId, setParentFolderId] = useState<DriveItemId>();

  const folders = useQuery(
    listLibraryFoldersOptions({
      client: domainClient,
      query: parentFolderId === undefined ? {} : { parentFolderId },
    }),
  );

  const selection = useMutation({
    ...selectLibraryMutation({ client: domainClient }),
    onSuccess: () => {
      queryClient.clear();
      globalThis.location.assign("/");
    },
  });

  const currentFolder = folders.data?.current;
  const error = selection.error ?? folders.error;

  const openFolder = (folderId: DriveItemId) => {
    selection.reset();
    setParentFolderId(folderId);
  };

  const goBack = () => {
    selection.reset();
    setParentFolderId(currentFolder?.parentFolderId);
  };

  return (
    <div className="mt-8">
      {error === null ? null : <LibraryFolderError error={error} />}

      <section
        aria-busy={folders.isPending}
        aria-label="OneDrive-mappen"
        className="overflow-hidden rounded-2xl border border-[#d8d0c1] bg-white"
      >
        <header className="border-b border-[#e4dccd] bg-[#faf7f0] px-4 py-4 sm:px-5">
          <p className="text-xs font-bold tracking-[0.14em] text-[#786f60] uppercase">
            Huidige map
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <FolderOpenIcon aria-hidden="true" className="size-5 shrink-0 text-[#8d6741]" />
            {currentFolder === undefined ? (
              <Skeleton className="h-5 w-52" />
            ) : (
              <p className="truncate font-semibold text-[#302c25]" title={currentFolder.path}>
                {currentFolder.path}
              </p>
            )}
          </div>
        </header>

        <div className="p-3 sm:p-4">
          {currentFolder?.isDriveRoot === false ? (
            <Button
              className="mb-2 justify-start text-[#665d4d]"
              disabled={folders.isFetching}
              onClick={goBack}
              type="button"
              variant="ghost"
            >
              <ChevronLeftIcon aria-hidden="true" />
              Naar bovenliggende map
            </Button>
          ) : null}

          {folders.isPending ? (
            <div aria-label="Mappen laden" className="grid gap-2 p-1">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : null}

          {folders.data?.folders.length === 0 ? (
            <div className="grid min-h-44 place-items-center rounded-xl border border-dashed p-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto mb-3 grid size-9 place-items-center rounded-lg bg-muted text-foreground">
                  <FolderIcon aria-hidden="true" className="size-4" />
                </span>
                <p className="text-sm font-medium tracking-tight">Geen onderliggende mappen</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Je kunt deze map als Hoofdmap kiezen of teruggaan.
                </p>
              </div>
            </div>
          ) : null}

          {folders.data === undefined ? null : (
            <ul className="grid gap-2">
              {folders.data.folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-[#d8d0c1] hover:bg-[#faf7f0] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    disabled={folders.isFetching}
                    onClick={() => {
                      openFolder(folder.id);
                    }}
                    type="button"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#efe6d7] text-[#8d6741]">
                      <FolderIcon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[#302c25]">
                        {folder.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#786f60]">
                        {folderCount(folder.childCount)}
                      </span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[#9b917f] transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {currentFolder?.isDriveRoot === false ? (
          <footer className="flex flex-col gap-3 border-t border-[#e4dccd] bg-[#faf7f0] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm leading-6 text-[#665d4d]">
              Kies pas na controle. Wijziging vereist later een Bibliotheekreset.
            </p>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    className="shrink-0 bg-[#433d32] text-white hover:bg-[#302c25]"
                    size="lg"
                  />
                }
              >
                Deze map kiezen
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <FolderOpenIcon aria-hidden="true" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Deze Hoofdmap bevestigen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong className="font-semibold text-foreground">{currentFolder.path}</strong>{" "}
                    wordt de grens van de Bibliotheek. Een andere map kiezen kan alleen via een
                    expliciete Bibliotheekreset.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={selection.isPending}>Terug</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={selection.isPending}
                    onClick={() => {
                      selection.mutate({
                        body: {
                          confirmed: true,
                          rootFolderId: currentFolder.id,
                        },
                      });
                    }}
                  >
                    {selection.isPending ? "Hoofdmap bevestigen…" : "Bevestig als Hoofdmap"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
