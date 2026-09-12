import type { BuildUpgradeRequiredEncoded } from "../generated/types.gen.ts";

type Listener = () => void;

let current: BuildUpgradeRequiredEncoded | null = null;

const listeners = new Set<Listener>();

export class MutationBlockedForUpgradeError extends Error {
  public override readonly name = "MutationBlockedForUpgradeError";
}

export function markReloadRequired(error: BuildUpgradeRequiredEncoded): void {
  current = error;

  for (const listener of listeners) {
    listener();
  }
}

export function getReloadRequirement(): BuildUpgradeRequiredEncoded | null {
  return current;
}

export function subscribeToReloadRequirement(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function clearReloadRequirement(): void {
  current = null;

  for (const listener of listeners) {
    listener();
  }
}
