import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { safeParse } from "valibot";
import { classifyDomainFailure, vDomainFailureInput } from "../api/domain-failure.ts";
import type { DomainFailure } from "../api/domain-failure.ts";
import { ShellLayout } from "./shell-layout.tsx";

function failureMessage(failure: DomainFailure): string {
  if (failure.kind === "reauthentication") {
    return "Verbind OneDrive opnieuw om deze Foto te hervatten.";
  }

  if (failure.kind === "unavailable") {
    return "De server is tijdelijk niet bereikbaar. Probeer het opnieuw.";
  }

  return failure.kind === "build-upgrade"
    ? failure.message
    : "De Beheer-webapp kon niet worden geladen. Probeer het opnieuw.";
}

function failureEyebrow(failure: DomainFailure): string {
  if (failure.kind === "build-upgrade") {
    return "Nieuwe versie beschikbaar";
  }

  return failure.kind === "reauthentication" ? "OneDrive-koppeling nodig" : "Tijdelijke fout";
}

export function AppErrorShell({ error }: ErrorComponentProps) {
  const parsed = safeParse(vDomainFailureInput, error);

  const failure: DomainFailure = parsed.success
    ? classifyDomainFailure(parsed.output)
    : { kind: "unexpected" };

  return (
    <ShellLayout eyebrow={failureEyebrow(failure)}>
      <h1 className="text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {failureMessage(failure)}
      </h1>
      {failure.kind === "reauthentication" ? (
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
