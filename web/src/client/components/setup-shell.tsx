import type { BootstrapState } from "../generated/types.gen.ts";
import { ShellLayout } from "./shell-layout.tsx";
import { StatusChip } from "./status-chip.tsx";

const setupCopy = {
  claim: {
    title: "Bevestig wie de Bibliotheek beheert",
    body: "De eerste aanmelding claimt deze installatie voor één Curator.",
  },
  graph: {
    title: "Koppel je OneDrive",
    body: "De Beheer-webapp vraagt alleen toegang tot de bestanden die je nodig hebt.",
  },
  indexing: {
    title: "De Bibliotheek wordt voorbereid",
    body: "Je Fotos worden veilig geïnventariseerd voordat de review begint.",
  },
  library: {
    title: "Kies de Hoofdmap",
    body: "Alleen deze tak van OneDrive wordt zichtbaar en bewerkbaar in de Beheer-webapp.",
  },
} as const;

export type SetupStep = keyof typeof setupCopy;

export function isSetupStep(step: string): step is SetupStep {
  return Object.hasOwn(setupCopy, step);
}

export function SetupShell({
  state,
  step,
}: {
  readonly state: BootstrapState;
  readonly step: SetupStep;
}) {
  const copy = setupCopy[step];

  return (
    <ShellLayout eyebrow="Installatie">
      <h1 className="font-display max-w-xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {copy.title}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">{copy.body}</p>
      <StatusChip>
        {"discoveredPhotos" in state
          ? `${state.discoveredPhotos} Fotos gevonden`
          : "Volgende stap bevestigd door de server"}
      </StatusChip>
    </ShellLayout>
  );
}
