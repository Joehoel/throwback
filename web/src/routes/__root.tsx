import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { AppErrorShell } from "#/client/components/app-error-shell.tsx";
import { NotFoundShell } from "#/client/components/not-found-shell.tsx";
import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

function RootDocument({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="nl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  errorComponent: AppErrorShell,
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    meta: [
      {
        charSet: "utf8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Throwback · Beheer-webapp",
      },
    ],
  }),
  notFoundComponent: NotFoundShell,
  shellComponent: RootDocument,
  ssr: false,
});
