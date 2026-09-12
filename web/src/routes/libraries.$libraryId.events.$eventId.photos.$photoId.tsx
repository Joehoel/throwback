import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { parse } from "valibot";
import { ReviewShell } from "#/client/components/review-shell.tsx";
import { vEventId, vLibraryId, vPhotoId } from "#/client/generated/valibot.gen.ts";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";

function ReviewRoute() {
  const state = useLoaderData({
    from: "/libraries/$libraryId/events/$eventId/photos/$photoId",
  });

  return <ReviewShell state={state} />;
}

export const Route = createFileRoute("/libraries/$libraryId/events/$eventId/photos/$photoId")({
  component: ReviewRoute,
  loader: loadBootstrap,
  params: {
    parse: ({ eventId, libraryId, photoId }) => ({
      eventId: parse(vEventId, eventId),
      libraryId: parse(vLibraryId, libraryId),
      photoId: parse(vPhotoId, photoId),
    }),
  },
});
