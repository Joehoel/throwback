import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getContext } from "./integrations/tanstack-query/root-provider";

// `createTanStackRouter`'s own `ReturnType` collapses the route tree to
// `AnyRoute`; binding `typeof routeTree` recovers the precise, type-safe router.
const createAppRouter = createTanStackRouter<typeof routeTree>;
type AppRouter = ReturnType<typeof createAppRouter>;

export function getRouter(): AppRouter {
  const context = getContext();

  const router = createTanStackRouter({
    context,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ queryClient: context.queryClient, router });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
