import type { ReactNode } from "react";

import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader(): ReactNode {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="h-8 w-8 bg-neutral-100 dark:bg-neutral-800 animate-pulse" />;
  }

  if (session?.user !== undefined) {
    const { image } = session.user;

    return (
      <div className="flex items-center gap-2">
        {image !== null && image !== undefined && image !== "" ? (
          <img src={image} alt="" className="h-8 w-8" />
        ) : (
          <div className="h-8 w-8 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {session.user.name.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            void authClient.signOut();
          }}
          className="flex-1 h-9 px-4 text-sm font-medium bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return null;
}
