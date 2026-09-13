import type { Query } from "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      readonly persist?: true;
    };
  }
}

/** Opt-in marker for server-confirmed read queries that the persistence contract allows. */
export const persistServerRead = { persist: true } as const;

/** Decide whether a successful query belongs to the explicit persistence allowlist. */
export function shouldPersistServerRead(query: Query): boolean {
  return query.meta?.persist === true && query.state.status === "success";
}
