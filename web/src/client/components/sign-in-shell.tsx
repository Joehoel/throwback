import { ShellLayout } from "./shell-layout.tsx";
import { StatusChip } from "./status-chip.tsx";

export function SignInShell() {
  return (
    <ShellLayout eyebrow="Throwback · Beheer-webapp">
      <h1 className="font-display max-w-xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        Breng de verhalen achter je familiefoto&apos;s terug.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">
        Meld je aan om Beschrijvingen, Locaties en Oriëntaties in je Bibliotheek te beheren.
      </p>
      <StatusChip>Volgende stap bevestigd door de server</StatusChip>
    </ShellLayout>
  );
}
