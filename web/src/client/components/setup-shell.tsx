import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { is } from "valibot";
import type { InferOutput } from "valibot";
import { claimCurator } from "../generated/sdk.gen.ts";
import { vCuratorClaimRequired, vGraphConnectionRequired } from "../generated/valibot.gen.ts";
import type { vBootstrapState } from "../generated/valibot.gen.ts";
import { domainClient } from "../api/domain-client.ts";
import { signInWithMicrosoft } from "../auth/auth-client.ts";
import { SessionActions } from "../auth/session-actions.tsx";
import { ShellLayout } from "./shell-layout.tsx";
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
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const account =
    is(vCuratorClaimRequired, state) || is(vGraphConnectionRequired, state)
      ? state.account
      : undefined;

  const confirmClaim = async () => {
    setPending(true);
    setError(undefined);

    const result = await claimCurator({
      body: { confirmed: true },
      client: domainClient,
    });

    if (result.error !== undefined) {
      setError(result.error.message);
      setPending(false);

      return;
    }

    queryClient.clear();
    globalThis.location.assign("/");
  };

  const reconnectMicrosoft = async () => {
    setPending(true);
    setError(undefined);

    const result = await signInWithMicrosoft();

    if (result.error !== null) {
      setError("OneDrive koppelen is niet gelukt. Probeer het opnieuw.");
      setPending(false);
    }
  };

  return (
    <ShellLayout eyebrow="Installatie">
      <h1 className="font-display max-w-xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {copy.title}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">{copy.body}</p>
      {account === undefined ? null : (
        <dl className="mt-6 max-w-xl rounded-2xl border border-[#d9cfbc] bg-white/60 p-5">
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-[#786f60] uppercase">
              Microsoft-account
            </dt>
            <dd className="mt-1 font-semibold text-[#302c25]">{account.name}</dd>
            <dd className="mt-1 text-sm text-[#665d4d]">{account.email}</dd>
          </div>
        </dl>
      )}
      {step === "claim" && is(vCuratorClaimRequired, state) ? (
        <button
          className="mt-6 min-h-11 rounded-full bg-[#433d32] px-6 font-semibold text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => void confirmClaim()}
          type="button"
        >
          {pending ? "Claim bevestigen…" : "Ja, claim met dit account"}
        </button>
      ) : null}
      {step === "graph" && is(vGraphConnectionRequired, state) ? (
        <button
          className="mt-6 min-h-11 rounded-full bg-[#433d32] px-6 font-semibold text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => void reconnectMicrosoft()}
          type="button"
        >
          {pending ? "Microsoft wordt geopend…" : "OneDrive opnieuw koppelen"}
        </button>
      ) : null}
      {error === undefined ? null : (
        <output aria-live="polite" className="mt-3 block text-[#8b3028]">
          {error}
        </output>
      )}
      <StatusChip>
        {"discoveredPhotos" in state
          ? `${state.discoveredPhotos} Fotos gevonden`
          : "Volgende stap bevestigd door de server"}
      </StatusChip>
      <SessionActions />
    </ShellLayout>
  );
}
