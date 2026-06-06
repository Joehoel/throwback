import { createFileRoute, redirect } from "@tanstack/react-router";
import { eventsQuery } from "#/prototypes/eventsQuery";

/** `/prototypes/splitscreen` → first event's first photo. */
export const Route = createFileRoute("/prototypes/splitscreen/")({
  loader: async ({ context }) => {
    const events = await context.queryClient.ensureQueryData(eventsQuery());
    const event = events[0];
    throw redirect({
      to: "/prototypes/splitscreen/$eventId/$photoId",
      params: { eventId: event.id, photoId: event.photos[0].id },
    });
  },
});
