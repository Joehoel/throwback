import { createFileRoute, notFound, useLoaderData, useParams } from "@tanstack/react-router";
import { SetupShell, isSetupStep } from "#/client/components/setup-shell.tsx";
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
  loader: loadBootstrap,
});
