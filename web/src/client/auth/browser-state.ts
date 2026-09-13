import type { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";

/** IndexedDB database reserved for persisted, server-confirmed Query read models. */
export const PERSISTED_QUERY_DATABASE = "throwback-query-cache";

const PERSISTED_QUERY_KEY = "persisted-client";

const queryStore = createStore(PERSISTED_QUERY_DATABASE, "query-client");

/** IndexedDB persister recommended by TanStack for Persisted Query Client. */
export const queryPersister = {
  persistClient: (client: PersistedClient) => set(PERSISTED_QUERY_KEY, client, queryStore),
  removeClient: () => del(PERSISTED_QUERY_KEY, queryStore),
  restoreClient: () => get<PersistedClient>(PERSISTED_QUERY_KEY, queryStore),
} satisfies Persister;

/** Remove all Curator data held by Query or the contracted IndexedDB cache. */
export async function clearCuratorBrowserState(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  await queryPersister.removeClient();
}
