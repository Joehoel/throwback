import { redirect } from "@tanstack/react-router";
import { bootstrapDestination } from "../navigation/bootstrap-destination.ts";
import { loadBootstrap } from "./load-bootstrap.ts";
import type { LoaderContext } from "./load-bootstrap.ts";

export async function loadHome(context: LoaderContext) {
  const state = await loadBootstrap(context);

  return redirect({ ...bootstrapDestination(state), throw: true });
}
