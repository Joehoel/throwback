import { QueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { parse } from "valibot";
import { persistServerRead, shouldPersistServerRead } from "../api/query-persistence.ts";
import { vSignInRequired } from "../generated/valibot.gen.ts";
import { loadBootstrap } from "../routes/load-bootstrap.ts";
import { clearCuratorBrowserState, queryPersister } from "./browser-state.ts";

function findQuery(queryClient: QueryClient, queryKey: readonly string[]): Query {
  const query = queryClient.getQueryCache().find({ queryKey });

  if (query === undefined) {
    throw new Error(`Expected query ${queryKey.join("/")} to exist`);
  }

  return query;
}

describe("Curator browser state", () => {
  it("clears both Query memory and the persisted IndexedDB client", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["library", "owner", "library-1"], { photoCount: 42 });
    await queryPersister.persistClient({
      buster: "test",
      clientState: { mutations: [], queries: [] },
      timestamp: Date.now(),
    });

    await clearCuratorBrowserState(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    await expect(queryPersister.restoreClient()).resolves.toBeUndefined();
  });

  it("persists only successful reads that explicitly opt in", async () => {
    const queryClient = new QueryClient();

    await queryClient.query({
      queryFn: () => Promise.resolve({ photoCount: 42 }),
      queryKey: ["allowed-read"],
      meta: persistServerRead,
    });
    await queryClient.query({
      queryFn: () => Promise.resolve({ photoCount: 13 }),
      queryKey: ["memory-only-read"],
    });
    await queryClient
      .query({
        queryFn: () => Promise.reject(new Error("expected test failure")),
        queryKey: ["failed-read"],
        meta: persistServerRead,
      })
      .catch(() => null);

    const allowed = findQuery(queryClient, ["allowed-read"]);
    const memoryOnly = findQuery(queryClient, ["memory-only-read"]);
    const failed = findQuery(queryClient, ["failed-read"]);

    expect(shouldPersistServerRead(allowed)).toBe(true);
    expect(shouldPersistServerRead(memoryOnly)).toBe(false);
    expect(shouldPersistServerRead(failed)).toBe(false);
  });

  it("clears memory and IndexedDB when bootstrap confirms an owner mismatch", async () => {
    const queryClient = new QueryClient();

    const ownerMismatch = parse(
      vSignInRequired,
      JSON.parse('{"_tag":"SignInRequired","reason":"ownerMismatch"}'),
    );

    const originalFetch = globalThis.fetch;

    queryClient.setQueryData(["library", "previous-owner"], { photoCount: 42 });
    await queryPersister.persistClient({
      buster: "test",
      clientState: { mutations: [], queries: [] },
      timestamp: Date.now(),
    });
    globalThis.fetch = () => Promise.resolve(Response.json(ownerMismatch));

    try {
      await expect(loadBootstrap({ context: { queryClient } })).resolves.toEqual(ownerMismatch);
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      await expect(queryPersister.restoreClient()).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
