import { useState } from "react";
import { is } from "valibot";
import { signInWithMicrosoft } from "../auth/auth-client.ts";
import type { ListLibraryFoldersError, SelectLibraryError } from "../generated/types.gen.ts";
import {
  vGraphReauthenticationRequiredEncoded,
  vInvalidLibrarySelectionEncoded,
  vLibraryAlreadySelectedEncoded,
  vLibraryStoreUnavailableEncoded,
  vOneDriveFolderNotFoundEncoded,
} from "../generated/valibot.gen.ts";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";

type LibraryFolderErrorValue = ListLibraryFoldersError | SelectLibraryError;

function errorTitle(error: LibraryFolderErrorValue): string {
  if (is(vGraphReauthenticationRequiredEncoded, error)) {
    return "Verbind OneDrive opnieuw";
  }

  if (is(vLibraryAlreadySelectedEncoded, error)) {
    return "De Hoofdmap kan niet hier worden gewijzigd";
  }

  if (is(vInvalidLibrarySelectionEncoded, error)) {
    return "Deze map kan niet als Hoofdmap worden gekozen";
  }

  if (is(vOneDriveFolderNotFoundEncoded, error)) {
    return "De OneDrive-map is niet bereikbaar";
  }

  if (is(vLibraryStoreUnavailableEncoded, error)) {
    return "De Bibliotheek kan niet worden opgeslagen";
  }

  return "De OneDrive-mappen konden niet worden geladen";
}

/** Present a folder-boundary failure and offer only safe recovery actions. */
export function LibraryFolderError({ error }: { readonly error: LibraryFolderErrorValue }) {
  const [reauthenticationPending, setReauthenticationPending] = useState(false);
  const [reauthenticationError, setReauthenticationError] = useState<string>();
  const reauthenticationRequired = is(vGraphReauthenticationRequiredEncoded, error);

  const reconnectMicrosoft = async () => {
    setReauthenticationPending(true);
    setReauthenticationError(undefined);

    const result = await signInWithMicrosoft();

    if (result.error !== null) {
      setReauthenticationError(
        "OneDrive opnieuw koppelen is niet gelukt. Probeer het met hetzelfde Microsoft-account opnieuw.",
      );
      setReauthenticationPending(false);
    }
  };

  return (
    <Alert className="mb-5" variant="destructive">
      <AlertTitle>{errorTitle(error)}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      {reauthenticationRequired ? (
        <Button
          className="mt-3"
          disabled={reauthenticationPending}
          onClick={() => void reconnectMicrosoft()}
          size="lg"
          type="button"
          variant="outline"
        >
          {reauthenticationPending
            ? "Microsoft wordt geopend…"
            : "Opnieuw koppelen met hetzelfde account"}
        </Button>
      ) : null}
      {reauthenticationError === undefined ? null : <p className="mt-2">{reauthenticationError}</p>}
    </Alert>
  );
}
