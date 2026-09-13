import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { is } from "valibot";
import { SignInShell } from "#/client/components/sign-in-shell.tsx";
import { vSignInRequired } from "#/client/generated/valibot.gen.ts";
import { bootstrapDestination } from "#/client/navigation/bootstrap-destination.ts";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";

function SignInRoute() {
  const state = useLoaderData({ from: "/sign-in" });

  return <SignInShell state={is(vSignInRequired, state) ? state : undefined} />;
}

export const Route = createFileRoute("/sign-in")({
  component: SignInRoute,
  loader: async (context) => {
    const state = await loadBootstrap(context);
    const destination = bootstrapDestination(state);

    if (destination.to !== "/sign-in") {
      redirect({ ...destination, throw: true });
    }

    return state;
  },
});
