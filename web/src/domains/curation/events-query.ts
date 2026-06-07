import { queryOptions } from "@tanstack/react-query";
import { loadEvents } from "./data";
import type { ThrowbackEvent } from "./data";

export const EVENTS_QUERY_KEY = ["prototype", "events"] as const;

/** The Library as a cached query — loader prefetches, components read, approvals
 *  patch it optimistically with setQueryData. */
export function eventsQuery() {
  return queryOptions({
    queryKey: EVENTS_QUERY_KEY,
    queryFn: () =>
      new Promise<ThrowbackEvent[]>((r) =>
        setTimeout(() => {
          r(loadEvents());
        }, 300),
      ),
  });
}
