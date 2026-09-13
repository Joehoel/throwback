import type { QueryClient } from "@tanstack/react-query";
import { is } from "valibot";
import { bootstrapQueryOptions } from "../api/bootstrap.ts";
import { clearCuratorBrowserState } from "../auth/browser-state.ts";
import { vSignInRequired } from "../generated/valibot.gen.ts";

export interface LoaderContext {
  readonly context: { readonly queryClient: QueryClient };
}

export async function loadBootstrap({ context }: LoaderContext) {
  const state = await context.queryClient.query({
    ...bootstrapQueryOptions(),
    staleTime: 0,
  });

  if (is(vSignInRequired, state) && state.reason === "ownerMismatch") {
    await clearCuratorBrowserState(context.queryClient);
  }

  return state;
}
