import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { domainClient } from "../api/domain-client.ts";
import { signInWithMicrosoft } from "../auth/auth-client.ts";
import { claimCurator } from "../generated/sdk.gen.ts";
import type { CuratorClaimRequired, GraphConnectionRequired } from "../generated/types.gen.ts";

type SetupAccountStepProperties =
  | { readonly operation: "claim"; readonly state: CuratorClaimRequired }
  | { readonly operation: "graph"; readonly state: GraphConnectionRequired };

function actionLabel(operation: SetupAccountStepProperties["operation"], pending: boolean): string {
  if (operation === "claim") {
    return pending ? "Claim bevestigen…" : "Ja, claim met dit account";
  }

  return pending ? "Microsoft wordt geopend…" : "OneDrive opnieuw koppelen";
}

/** Confirm the Curator account or repair its delegated OneDrive grant. */
export function SetupAccountStep({ operation, state }: SetupAccountStepProperties) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const continueSetup = async () => {
    setPending(true);
    setError(undefined);

    if (operation === "claim") {
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

      return;
    }

    const result = await signInWithMicrosoft();

    if (result.error !== null) {
      setError("OneDrive koppelen is niet gelukt. Probeer het opnieuw.");
      setPending(false);
    }
  };

  return (
    <>
      <dl className="mt-6 max-w-xl rounded-2xl border border-[#d9cfbc] bg-white/60 p-5">
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[#786f60] uppercase">
            Microsoft-account
          </dt>
          <dd className="mt-1 font-semibold text-[#302c25]">{state.account.name}</dd>
          <dd className="mt-1 text-sm text-[#665d4d]">{state.account.email}</dd>
        </div>
      </dl>
      <button
        className="mt-6 min-h-11 rounded-full bg-[#433d32] px-6 font-semibold text-white disabled:opacity-50"
        disabled={pending}
        onClick={() => void continueSetup()}
        type="button"
      >
        {actionLabel(operation, pending)}
      </button>
      {error === undefined ? null : (
        <output aria-live="polite" className="mt-3 block text-[#8b3028]">
          {error}
        </output>
      )}
    </>
  );
}
