import { createFileRoute } from "@tanstack/react-router";
import { SignInShell } from "#/client/components/sign-in-shell.tsx";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";

function SignInRoute() {
  return <SignInShell />;
}

export const Route = createFileRoute("/sign-in")({
  component: SignInRoute,
  loader: loadBootstrap,
});
