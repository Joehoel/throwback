import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { parse } from "valibot";
import { ReviewShell } from "#/client/components/review-shell.tsx";
import { vEventId, vLibraryId, vPhotoId } from "#/client/generated/valibot.gen.ts";
import { bootstrapDestination } from "#/client/navigation/bootstrap-destination.ts";
import { loadBootstrap } from "#/client/routes/load-bootstrap.ts";

function ReviewRoute() {
  const state = useLoaderData({
    from: "/libraries/$libraryId/events/$eventId/photos/$photoId",
  });

  return <ReviewShell state={state} />;
}

export const Route = createFileRoute("/libraries/$libraryId/events/$eventId/photos/$photoId")({
  component: ReviewRoute,
  loader: async (context) => {
    const state = await loadBootstrap(context);
    const destination = bootstrapDestination(state);

    if (
      destination.to !== "/libraries/$libraryId/events/$eventId/photos/$photoId" ||
      destination.params.libraryId !== context.params.libraryId ||
      destination.params.eventId !== context.params.eventId ||
      destination.params.photoId !== context.params.photoId
    ) {
      redirect({ ...destination, throw: true });
    }

    return state;
  },
  params: {
    parse: ({ eventId, libraryId, photoId }) => ({
      eventId: parse(vEventId, eventId),
      libraryId: parse(vLibraryId, libraryId),
      photoId: parse(vPhotoId, photoId),
    }),
  },
});
