import { QueryClient } from "@tanstack/react-query";

export function getContext(): { queryClient: QueryClient } {
  const queryClient = new QueryClient();

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider(): null {
  return null;
}
