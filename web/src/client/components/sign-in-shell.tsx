import { useState } from "react";
import type { SignInRequired } from "../generated/types.gen.ts";
import { signInWithMicrosoft } from "../auth/auth-client.ts";
import { ShellLayout } from "./shell-layout.tsx";
import { StatusChip } from "./status-chip.tsx";

export function SignInShell({ state }: { readonly state?: SignInRequired }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const signIn = async () => {
    setPending(true);
    setError(undefined);
    const result = await signInWithMicrosoft();

    if (result.error !== null) {
      setError("Aanmelden met Microsoft is niet gelukt. Probeer het opnieuw.");
      setPending(false);
    }
  };

  return (
    <ShellLayout eyebrow="Throwback · Beheer-webapp">
      <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        Breng de verhalen achter je familiefoto&apos;s terug.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">
        {state?.reason === "ownerMismatch"
          ? "Dit is niet het Microsoft-account dat deze installatie beheert. Meld je aan met het account van de Curator."
          : "Meld je aan om Beschrijvingen, Locaties en Oriëntaties in je Bibliotheek te beheren."}
      </p>
      <button
        className="mt-7 min-h-11 rounded-full bg-[#433d32] px-6 font-semibold text-white disabled:opacity-50"
        disabled={pending}
        onClick={() => void signIn()}
        type="button"
      >
        {pending ? "Microsoft wordt geopend…" : "Aanmelden met Microsoft"}
      </button>
      {error === undefined ? null : (
        <output aria-live="polite" className="mt-3 block text-[#8b3028]">
          {error}
        </output>
      )}
      <StatusChip>Volgende stap bevestigd door de server</StatusChip>
    </ShellLayout>
  );
}
