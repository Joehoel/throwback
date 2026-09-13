import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PropsWithChildren } from "react";
import { queryPersister } from "#/client/auth/browser-state.ts";
import { BUILD_ID } from "#/client/config/build-id.ts";
import { shouldPersistServerRead } from "#/client/api/query-persistence.ts";

const PERSISTED_QUERY_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

const PERSISTED_QUERY_BUSTER = `${BUILD_ID}:schema-1`;

export interface RouterContext {
  readonly queryClient: QueryClient;
}

export function getContext(): RouterContext {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: PERSISTED_QUERY_MAX_AGE,
        refetchOnMount: "always",
        refetchOnReconnect: "always",
        refetchOnWindowFocus: "always",
      },
    },
  });

  return {
    queryClient,
  };
}

/** Restore and persist only explicitly allowlisted, server-confirmed read queries. */
export function PersistedQueryProvider({
  children,
  client,
}: PropsWithChildren<{ readonly client: QueryClient }>) {
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        buster: PERSISTED_QUERY_BUSTER,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: shouldPersistServerRead,
        },
        maxAge: PERSISTED_QUERY_MAX_AGE,
        persister: queryPersister,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
