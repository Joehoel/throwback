import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useParams,
} from "@tanstack/react-router";
import { SetupShell, isSetupStep } from "#/client/components/setup-shell.tsx";
import { bootstrapDestination } from "#/client/navigation/bootstrap-destination.ts";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";

function SetupRoute() {
  const { step } = useParams({ from: "/setup/$step" });
  const state = useLoaderData({ from: "/setup/$step" });

  if (!isSetupStep(step)) {
    notFound({ throw: true });

    return null;
  }

  return <SetupShell state={state} step={step} />;
}

export const Route = createFileRoute("/setup/$step")({
  component: SetupRoute,
  loader: async (context) => {
    const state = await loadBootstrap(context);
    const destination = bootstrapDestination(state);

    if (destination.to !== "/setup/$step" || destination.params.step !== context.params.step) {
      redirect({ ...destination, throw: true });
    }

    return state;
  },
});
