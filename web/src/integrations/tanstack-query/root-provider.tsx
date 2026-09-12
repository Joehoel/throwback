import { QueryClient } from "@tanstack/react-query";

export interface RouterContext {
  readonly queryClient: QueryClient;
}

export function getContext(): RouterContext {
  const queryClient = new QueryClient();

  return {
    queryClient,
  };
}

export default function TanstackQueryProvider(): null {
  return null;
}
