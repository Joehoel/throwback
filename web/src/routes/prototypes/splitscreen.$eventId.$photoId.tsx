/**
 * Splitscreen review screen — URL-driven.
 *   path:   /prototypes/splitscreen/$eventId/$photoId   (the active event + photo)
 *   search: ?filter=&lat=&lng=&z=                        (filter + map viewport)
 * Search params are validated with effect/Schema via its Standard Schema v1
 * bridge (ADR-0012/0013). The help overlay is transient local state (not URL).
 *
 * The URL is the single source of truth for the cursor (no cursor in any
 * machine). TanStack Query is the cache (loader prefetch); the photoMachine owns
 * the per-photo edit lifecycle (the provider is remounted via key={photoId}); the
 * write queue is a long-lived actor in the layout. This route is a thin shell:
 * it orchestrates URL/data and composes the `Review.*` compound parts.
 */
import { useState } from "react";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { Loader } from "@cloudflare/kumo";
import type { Photo, ThrowbackEvent } from "#/domains/curation/data.ts";
import type { PhotoOutput } from "#/domains/curation/machine/photo-machine.ts";
import type { WriteKind } from "#/domains/curation/machine/write-queue-machine.ts";
import { WriteQueue } from "#/domains/curation/write-queue.tsx";
import { EVENTS_QUERY_KEY, eventsQuery } from "#/domains/curation/events-query.ts";
import { Review } from "#/domains/curation/components/review/index.ts";

// Search params (effect/Schema → Standard Schema v1 validator) — filter + viewport only.
const ReviewSearch = Schema.Struct({
  filter: Schema.optionalKey(Schema.Literals(["any", "missing_description", "missing_location"])),
  lat: Schema.optionalKey(Schema.Number),
  lng: Schema.optionalKey(Schema.Number),
  z: Schema.optionalKey(Schema.Number),
});

export const Route = createFileRoute("/prototypes/splitscreen/$eventId/$photoId")({
  validateSearch: Schema.toStandardSchemaV1(ReviewSearch),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery()),
  component: ScreenRoute,
});

function ScreenRoute(): React.ReactNode {
  return (
    <ClientOnly fallback={<FullScreen>{<Loader size="lg" />}</FullScreen>}>
      <Loaded />
    </ClientOnly>
  );
}

function FullScreen({ children }: { children: React.ReactNode }): React.ReactNode {
  return <div className="flex h-screen items-center justify-center bg-kumo-base">{children}</div>;
}

// Loading guard kept separate so ReviewScreen's hooks are always unconditional.
function Loaded(): React.ReactNode {
  const { data: events } = useQuery(eventsQuery());
  if (!events) return <FullScreen>{<Loader size="lg" />}</FullScreen>;
  return <ReviewScreen events={events} />;
}

function applyApproval(
  events: ThrowbackEvent[],
  eventId: string,
  photoId: string,
  out: Extract<PhotoOutput, { decision: "approved" }>,
): ThrowbackEvent[] {
  return events.map((e) =>
    e.id !== eventId
      ? e
      : {
          ...e,
          location: out.place,
          coords: out.coords,
          photos: e.photos.map((p) =>
            p.id !== photoId
              ? p
              : {
                  ...p,
                  description: out.description.trim() || p.description,
                  rotationFixed: out.orientationFixed,
                },
          ),
        },
  );
}

function neededWrites(
  photo: Photo,
  out: Extract<PhotoOutput, { decision: "approved" }>,
  seedPlace: string,
): WriteKind[] {
  const kinds: WriteKind[] = [];
  const desc = out.description.trim();
  if (desc && desc !== (photo.description ?? "")) kinds.push("description");
  if (out.orientationFixed !== photo.rotationFixed || out.place !== seedPlace)
    kinds.push("location_orientation");
  return kinds;
}

function ReviewScreen({ events }: { events: ThrowbackEvent[] }): React.ReactNode {
  const { eventId, photoId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const writeRef = WriteQueue.useActorRef();
  const jobs = WriteQueue.useSelector((s) => s.context.jobs);
  const [helpOpen, setHelpOpen] = useState(false);

  const event = events.find((e) => e.id === eventId) ?? events[0];
  const filter = search.filter ?? "any";
  const predicate = (p: Photo): boolean =>
    filter === "missing_description"
      ? p.description === null
      : filter === "missing_location"
        ? event.location === null
        : true;
  const filtered = event.photos.filter(predicate);
  const photo = event.photos.find((p) => p.id === photoId) ?? event.photos[0];
  const list = filtered.some((p) => p.id === photo.id) ? filtered : event.photos;
  const idx = list.findIndex((p) => p.id === photo.id);
  const eventIndex = events.findIndex((e) => e.id === event.id);

  const goPhoto = (id: string): void => {
    void navigate({
      to: "/prototypes/splitscreen/$eventId/$photoId",
      params: { eventId: event.id, photoId: id },
      search: (prev) => prev, // keep filter + viewport
    });
  };
  const goEvent = (id: string): void => {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    void navigate({
      to: "/prototypes/splitscreen/$eventId/$photoId",
      params: { eventId: id, photoId: e.photos[0].id },
      search: (prev) => ({ filter: prev.filter }), // drop viewport on event switch
    });
  };
  const setSearch = (patch: Record<string, unknown>, replace = false): void => {
    void navigate({
      to: "/prototypes/splitscreen/$eventId/$photoId",
      params: { eventId: event.id, photoId: photo.id },
      search: (prev) => ({ ...prev, ...patch }),
      replace,
    });
  };

  const onCommit = (out: PhotoOutput): void => {
    if (out.decision === "approved") {
      const seedPlace = event.location ?? event.aiPlace;
      const next = applyApproval(events, event.id, photo.id, out);
      queryClient.setQueryData(EVENTS_QUERY_KEY, next);
      const kinds = neededWrites(photo, out, seedPlace);
      if (kinds.length)
        writeRef.send({
          type: "enqueue",
          jobs: kinds.map((kind) => ({ photoId: photo.id, kind })),
        });
    }
    const nextPhoto = list[idx + 1];
    if (nextPhoto && nextPhoto.id !== photo.id) goPhoto(nextPhoto.id);
  };

  return (
    <Review.Provider
      key={`${event.id}:${photo.id}`}
      photo={photo}
      event={event}
      events={events}
      helpOpen={helpOpen}
      viewport={
        search.lat != null && search.lng != null
          ? { lat: search.lat, lng: search.lng, z: search.z }
          : undefined
      }
      runningWrites={jobs.filter((j) => j.status === "running").length}
      savedWrites={jobs.filter((j) => j.status === "succeeded").length}
      hasNext={idx < list.length - 1}
      onPrev={() => idx > 0 && goPhoto(list[idx - 1].id)}
      onNext={() => idx < list.length - 1 && goPhoto(list[idx + 1].id)}
      onEventPrev={() => eventIndex > 0 && goEvent(events[eventIndex - 1].id)}
      onEventNext={() => eventIndex < events.length - 1 && goEvent(events[eventIndex + 1].id)}
      onSelectEvent={goEvent}
      onToggleHelp={() => setHelpOpen((o) => !o)}
      onCloseHelp={() => setHelpOpen(false)}
      onViewport={(v) => setSearch({ lat: v.lat, lng: v.lng, z: v.z }, true)}
      onPickPhoto={goPhoto}
      onCommit={onCommit}
    >
      <div className="flex h-screen flex-col bg-kumo-base">
        <Review.Header />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Review.Stage />
          <Review.EditPanel />
        </div>
        <Review.Filmstrip />
        <Review.HelpDialog />
      </div>
    </Review.Provider>
  );
}
