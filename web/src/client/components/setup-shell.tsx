import { is } from "valibot";
import type { InferOutput } from "valibot";
import { vCuratorClaimRequired, vGraphConnectionRequired } from "../generated/valibot.gen.ts";
import type { vBootstrapState } from "../generated/valibot.gen.ts";
import { SessionActions } from "../auth/session-actions.tsx";
import { LibraryFolderPicker } from "./library-folder-picker.tsx";
import { ShellLayout } from "./shell-layout.tsx";
import { SetupAccountStep } from "./setup-account-step.tsx";
import { StatusChip } from "./status-chip.tsx";

const setupCopy = {
  claim: {
    title: "Bevestig wie de Bibliotheek beheert",
    body: "Controleer het Microsoft-account. Na bevestiging kan alleen dit account de installatie beheren.",
  },
  graph: {
    title: "Koppel je OneDrive",
    body: "Microsoft verleent toegang tot je OneDrive. De Beheer-webapp begrenst alle normale handelingen tot de Hoofdmap die je hierna kiest.",
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

type BootstrapState = InferOutput<typeof vBootstrapState>;

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
      <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {copy.title}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">{copy.body}</p>
      {step === "claim" && is(vCuratorClaimRequired, state) ? (
        <SetupAccountStep operation="claim" state={state} />
      ) : null}
      {step === "graph" && is(vGraphConnectionRequired, state) ? (
        <SetupAccountStep operation="graph" state={state} />
      ) : null}
      {step === "library" ? <LibraryFolderPicker /> : null}
      <StatusChip>
        {"discoveredPhotos" in state
          ? `${state.discoveredPhotos} Fotos gevonden`
          : "Volgende stap bevestigd door de server"}
      </StatusChip>
      <SessionActions />
    </ShellLayout>
  );
}
