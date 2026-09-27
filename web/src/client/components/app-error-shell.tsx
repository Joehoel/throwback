import { Link } from "@tanstack/react-router";
import { is, safeParse } from "valibot";
import {
  vBuildUpgradeRequiredEncoded,
  vGraphReauthenticationRequiredEncoded,
  vLibraryStoreUnavailableEncoded,
  vOneDriveUnavailableEncoded,
  vPhotoProjectionUnavailableEncoded,
} from "../generated/valibot.gen.ts";
import { ShellLayout } from "./shell-layout.tsx";

interface FailureMessageOptions {
  readonly buildUpgrade: string | null;
  readonly reauthentication: boolean;
  readonly unavailable: boolean;
}

function failureMessage(options: FailureMessageOptions): string {
  if (options.reauthentication) {
    return "Verbind OneDrive opnieuw om deze Foto te hervatten.";
  }

  if (options.unavailable) {
    return "De server is tijdelijk niet bereikbaar. Probeer het opnieuw.";
  }

  return options.buildUpgrade ?? "De Beheer-webapp kon niet worden geladen. Probeer het opnieuw.";
}

function failureEyebrow(buildUpgrade: boolean, reauthentication: boolean): string {
  if (buildUpgrade) {
    return "Nieuwe versie beschikbaar";
  }

  return reauthentication ? "OneDrive-koppeling nodig" : "Tijdelijke fout";
}

export function AppErrorShell({ error }: { readonly error: unknown }) {
  const parsed = safeParse(vBuildUpgradeRequiredEncoded, error);

  const reauthentication = is(vGraphReauthenticationRequiredEncoded, error);

  const unavailable =
    is(vLibraryStoreUnavailableEncoded, error) ||
    is(vOneDriveUnavailableEncoded, error) ||
    is(vPhotoProjectionUnavailableEncoded, error);

  const message = failureMessage({
    buildUpgrade: parsed.success ? parsed.output.message : null,
    reauthentication,
    unavailable,
  });

  return (
    <ShellLayout eyebrow={failureEyebrow(parsed.success, reauthentication)}>
      <h1 className="text-4xl leading-tight font-semibold text-balance sm:text-5xl">{message}</h1>
      {reauthentication ? (
        <Link
          to="/setup/$step"
          params={{ step: "graph" }}
          className="mt-8 inline-flex min-h-11 items-center bg-[#245c52] px-5 font-bold text-white outline-offset-4 transition-colors hover:bg-[#19463e] focus-visible:outline-2 focus-visible:outline-[#245c52]"
        >
          OneDrive verbinden
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            globalThis.location.reload();
          }}
          className="mt-8 min-h-11 bg-[#245c52] px-5 font-bold text-white outline-offset-4 transition-colors hover:bg-[#19463e] focus-visible:outline-2 focus-visible:outline-[#245c52]"
        >
          Pagina opnieuw laden
        </button>
      )}
    </ShellLayout>
  );
}
