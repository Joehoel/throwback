import { Button, Loader } from "@cloudflare/kumo";
import { FolderIcon } from "@phosphor-icons/react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { useState } from "react";
import { Centered, FolderBrowser } from "#/domains/curation/components/local/folder-browser.tsx";
import { PhotoSource } from "#/domains/local/source.ts";
import type { IngestResult } from "#/domains/local/source.ts";
import { LocalRuntime } from "#/effect/client-runtime.ts";

/**
 * Local-folder curation harness (phase 1: read-only). Pick a downloaded folder via
 * the File System Access API, crawl it into the real `Photo` domain model, and
 * browse it by folder structure — no OneDrive, no Worker round-trip. The EXIF
 * write-back and the full review/edit flow land in the next phase.
 */

const supportsFsa = (): boolean => typeof globalThis.showDirectoryPicker === "function";

// Crawl a picked directory on the client runtime. (Effect.flatMap on the service
// tag rather than `.use`, which the react-hooks lint mistakes for React's `use`.)
const ingestFolder = (handle: FileSystemDirectoryHandle): Promise<IngestResult> =>
  LocalRuntime.runPromise(Effect.flatMap(PhotoSource, (source) => source.ingest(handle)));

function CurateApp(): React.ReactNode {
  const [result, setResult] = useState<IngestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pickFolder = async (): Promise<void> => {
    setErrorMessage(null);
    let handle: FileSystemDirectoryHandle;
    try {
      // Must run inside the click handler — picking requires a user gesture.
      handle = await globalThis.showDirectoryPicker({ mode: "readwrite" });
    } catch (error) {
      // user cancelled the picker → no-op
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setErrorMessage(String(error));
      return;
    }
    setBusy(true);
    try {
      setResult(await ingestFolder(handle));
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!supportsFsa()) {
    return (
      <Centered>
        <p className="max-w-sm text-center text-kumo-subtle">
          Deze testmodus gebruikt de File System Access API en werkt alleen in een Chromium-browser
          (Chrome of Edge) via een beveiligde context.
        </p>
      </Centered>
    );
  }

  if (busy) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <Loader size="lg" />
          <p className="text-sm text-kumo-subtle">Map inlezen…</p>
        </div>
      </Centered>
    );
  }

  if (result === null) {
    return (
      <Centered>
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <FolderIcon size={48} className="text-kumo-subtle" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold text-kumo-default">Map kiezen</h1>
            <p className="mt-1 text-sm text-kumo-subtle">
              Kies een lokale map met foto’s om de curatie-app op echte bestanden te testen. De
              bestanden blijven op je machine.
            </p>
          </div>
          <Button
            onClick={() => {
              void pickFolder();
            }}
          >
            Kies map
          </Button>
          {errorMessage === null ? null : (
            <p className="text-sm text-kumo-danger">{errorMessage}</p>
          )}
        </div>
      </Centered>
    );
  }

  return (
    <FolderBrowser
      key={result.root.id}
      result={result}
      onPickAgain={() => {
        void pickFolder();
      }}
    />
  );
}

function CuratePage(): React.ReactNode {
  // Browser-only: the File System Access API has no SSR meaning.
  return (
    <ClientOnly
      fallback={
        <Centered>
          <Loader size="lg" />
        </Centered>
      }
    >
      <CurateApp />
    </ClientOnly>
  );
}

export const Route = createFileRoute("/curate")({ component: CuratePage });
