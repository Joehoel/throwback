import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client.ts";
import { clearCuratorBrowserState } from "./browser-state.ts";

type SignOutScope = "current" | "all";

/** Device, all-device, and Cloudflare Access sign-out actions. */
export function SessionActions() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<SignOutScope>();
  const [error, setError] = useState<string>();

  const signOut = async (scope: SignOutScope) => {
    setPending(scope);
    setError(undefined);

    const result =
      scope === "current" ? await authClient.signOut() : await authClient.revokeSessions();

    if (result.error !== null) {
      setError("Uitloggen is niet gelukt. Probeer het opnieuw.");
      setPending(undefined);

      return;
    }

    await clearCuratorBrowserState(queryClient);
    globalThis.location.assign("/");
  };

  const signOutAccess = async () => {
    await clearCuratorBrowserState(queryClient);
    globalThis.location.assign("/cdn-cgi/access/logout");
  };

  return (
    <div className="mt-8 border-t border-[#d9cfbc] pt-5 text-sm text-[#665d4d]">
      <div className="flex flex-wrap gap-3">
        <button
          className="min-h-11 rounded-full border border-[#b8aa91] px-4 font-semibold text-[#433d32] disabled:opacity-50"
          disabled={pending !== undefined}
          onClick={() => void signOut("current")}
          type="button"
        >
          {pending === "current" ? "Uitloggen…" : "Uitloggen op dit apparaat"}
        </button>
        <button
          className="min-h-11 rounded-full border border-[#b8aa91] px-4 font-semibold text-[#433d32] disabled:opacity-50"
          disabled={pending !== undefined}
          onClick={() => void signOut("all")}
          type="button"
        >
          {pending === "all" ? "Uitloggen…" : "Uitloggen op alle apparaten"}
        </button>
        <button
          className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline underline-offset-4"
          disabled={pending !== undefined}
          onClick={() => void signOutAccess()}
          type="button"
        >
          Cloudflare Access uitloggen
        </button>
      </div>
      {error === undefined ? null : (
        <output aria-live="polite" className="mt-3 block text-[#8b3028]">
          {error}
        </output>
      )}
    </div>
  );
}
