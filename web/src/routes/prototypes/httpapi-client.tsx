import { createFileRoute } from "@tanstack/react-router";
import { getPhotoOptions } from "../../../spike/effect-httpapi-heyapi/generated/@tanstack/react-query.gen.ts";
import {
  client,
  parseDriveId,
  parseDriveItemId,
} from "../../../spike/effect-httpapi-heyapi/src/client.ts";

export const Route = createFileRoute("/prototypes/httpapi-client")({
  ssr: false,
  component: HttpApiClientProof,
});

function HttpApiClientProof(): React.ReactNode {
  const baseUrl = `${window.location.origin}/prototypes/httpapi`;
  client.setConfig({ baseUrl, credentials: "same-origin" });
  const options = getPhotoOptions({
    path: {
      driveId: parseDriveId("drive-1"),
      driveItemId: parseDriveItemId("photo-1"),
    },
    query: { projectionRevision: "1" },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Effect HttpApi → Hey API</h1>
      <p>This client-only route imports the generated Fetch and TanStack Query artifacts.</p>
      <pre className="overflow-auto rounded-lg bg-neutral-950 p-4 text-sm text-neutral-100">
        {JSON.stringify(options.queryKey, undefined, 2)}
      </pre>
    </main>
  );
}
