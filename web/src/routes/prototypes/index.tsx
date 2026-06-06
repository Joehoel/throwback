import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/prototypes` → the splitscreen prototype. */
export const Route = createFileRoute("/prototypes/")({
  beforeLoad: () => {
    throw redirect({ to: "/prototypes/splitscreen" });
  },
});
