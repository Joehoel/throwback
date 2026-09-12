import type { QueryClient } from "@tanstack/react-query";
import { bootstrapQueryOptions } from "../api/bootstrap.ts";

export interface LoaderContext {
  readonly context: { readonly queryClient: QueryClient };
}

export function loadBootstrap({ context }: LoaderContext) {
  return context.queryClient.query({ ...bootstrapQueryOptions(), staleTime: "static" });
}
