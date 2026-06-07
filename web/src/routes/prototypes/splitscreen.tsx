import { Outlet, createFileRoute } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { WriteQueue } from "#/domains/curation/write-queue";

/**
 * Layout for the splitscreen review prototype. Hosts the long-lived write-queue
 * actor (survives photo navigation) and a QueryClientProvider bound to the
 * router's queryClient (so loader prefetch + component `useQuery` share a cache).
 */
function SplitscreenLayout(): React.ReactNode {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <WriteQueue.Provider>
        <Outlet />
      </WriteQueue.Provider>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/prototypes/splitscreen")({ component: SplitscreenLayout });
