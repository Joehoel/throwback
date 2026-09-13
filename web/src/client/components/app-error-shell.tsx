import { safeParse } from "valibot";
import { vBuildUpgradeRequiredEncoded } from "../generated/valibot.gen.ts";
import { ShellLayout } from "./shell-layout.tsx";

export function AppErrorShell({ error }: { readonly error: unknown }) {
  const parsed = safeParse(vBuildUpgradeRequiredEncoded, error);

  const message = parsed.success
    ? parsed.output.message
    : "De Beheer-webapp kon niet worden geladen. Probeer het opnieuw.";

  return (
    <ShellLayout eyebrow={parsed.success ? "Nieuwe versie beschikbaar" : "Tijdelijke fout"}>
      <h1 className="font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {message}
      </h1>
      <button
        type="button"
        onClick={() => {
          globalThis.location.reload();
        }}
        className="mt-8 min-h-11 bg-[#245c52] px-5 font-bold text-white outline-offset-4 transition-colors hover:bg-[#19463e] focus-visible:outline-2 focus-visible:outline-[#245c52]"
      >
        Pagina opnieuw laden
      </button>
    </ShellLayout>
  );
}
