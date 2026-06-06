/**
 * Splitscreen review screen — URL-driven.
 *   path:   /prototypes/splitscreen/$eventId/$photoId   (the active event + photo)
 *   search: ?filter=&lat=&lng=&z=                        (filter + map viewport)
 * Search params are validated with effect/Schema via its Standard Schema v1
 * bridge (ADR-0012/0013). The help overlay is transient local state (not URL).
 *
 * The URL is the single source of truth for the cursor (no cursor in any
 * machine). TanStack Query is the cache (loader prefetch); the photoMachine owns
 * the per-photo edit lifecycle (remounted via key={photoId}); the write queue is
 * a long-lived actor in the layout.
 */
import { useEffect, useState } from "react";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import { Badge, Button, Dialog, InputArea, Loader, Tabs, Text } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, ArrowRightIcon, CheckIcon, KeyboardIcon, SparkleIcon } from "@phosphor-icons/react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { type Photo, type ThrowbackEvent, eventProgress, photoDone } from "#/prototypes/data";
import { Kbd, PhotoView } from "#/prototypes/shared";
import { LocationSection, type Viewport } from "#/prototypes/LocationPicker";
import { type PhotoOutput, photoMachine } from "#/prototypes/machine/photoMachine";
import { type WriteKind } from "#/prototypes/machine/writeQueueMachine";
import { WriteQueue } from "#/prototypes/WriteQueue";
import { EVENTS_QUERY_KEY, eventsQuery } from "#/prototypes/eventsQuery";

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
              : { ...p, description: out.description.trim() || p.description, rotationFixed: out.orientationFixed },
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
  if (out.orientationFixed !== photo.rotationFixed || out.place !== seedPlace) kinds.push("location_orientation");
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
      if (kinds.length) writeRef.send({ type: "enqueue", jobs: kinds.map((kind) => ({ photoId: photo.id, kind })) });
    }
    const nextPhoto = list[idx + 1];
    if (nextPhoto && nextPhoto.id !== photo.id) goPhoto(nextPhoto.id);
  };

  return (
    <PhotoEditor
      key={`${event.id}:${photo.id}`}
      photo={photo}
      event={event}
      events={events}
      filter={filter}
      helpOpen={helpOpen}
      viewport={search.lat != null && search.lng != null ? { lat: search.lat, lng: search.lng, z: search.z } : undefined}
      runningWrites={jobs.filter((j) => j.status === "running").length}
      savedWrites={jobs.filter((j) => j.status === "succeeded").length}
      hasNext={idx < list.length - 1}
      onPrev={() => idx > 0 && goPhoto(list[idx - 1].id)}
      onNext={() => idx < list.length - 1 && goPhoto(list[idx + 1].id)}
      onEventPrev={() => eventIndex > 0 && goEvent(events[eventIndex - 1].id)}
      onEventNext={() => eventIndex < events.length - 1 && goEvent(events[eventIndex + 1].id)}
      onSelectEvent={goEvent}
      onSetFilter={(f) => setSearch({ filter: f === "any" ? undefined : f })}
      onToggleHelp={() => setHelpOpen((o) => !o)}
      onCloseHelp={() => setHelpOpen(false)}
      onViewport={(v) => setSearch({ lat: v.lat, lng: v.lng, z: v.z }, true)}
      onPickPhoto={goPhoto}
      onCommit={onCommit}
    />
  );
}

interface EditorProps {
  photo: Photo;
  event: ThrowbackEvent;
  events: ThrowbackEvent[];
  filter: string;
  helpOpen: boolean;
  viewport?: Viewport;
  runningWrites: number;
  savedWrites: number;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onEventPrev: () => void;
  onEventNext: () => void;
  onSelectEvent: (id: string) => void;
  onSetFilter: (f: string) => void;
  onToggleHelp: () => void;
  onCloseHelp: () => void;
  onViewport: (v: Viewport) => void;
  onPickPhoto: (id: string) => void;
  onCommit: (out: PhotoOutput) => void;
}

const SHORTCUTS = [
  { keys: <Kbd>←</Kbd>, label: "Vorige foto" },
  { keys: <Kbd>→</Kbd>, label: "Volgende foto" },
  {
    keys: (
      <span className="flex gap-1">
        <Kbd>[</Kbd>
        <Kbd>]</Kbd>
      </span>
    ),
    label: "Vorige / volgende gebeurtenis",
  },
  {
    keys: (
      <span className="flex items-center gap-1">
        <Kbd>⌘/Ctrl</Kbd>
        <Kbd>↵</Kbd>
      </span>
    ),
    label: "Opslaan en volgende",
  },
  { keys: <Kbd>R</Kbd>, label: "Scheve scan rechtzetten" },
  { keys: <Kbd>A</Kbd>, label: "AI-suggestie overnemen" },
  { keys: <Kbd>?</Kbd>, label: "Dit overzicht tonen" },
];

function PhotoEditor(props: EditorProps): React.ReactNode {
  const { photo, event, events, filter, helpOpen } = props;
  const [snapshot, send] = useMachine(photoMachine, {
    input: {
      photo,
      place: event.location ?? event.aiPlace,
      coords: event.coords,
      eventName: event.name,
      period: event.period,
    },
  });

  useEffect(() => {
    if (snapshot.status === "done") props.onCommit(snapshot.output);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.status]);

  const { description, suggestion, place, coords, orientationFixed, aiPlaceSuggestion } = snapshot.context;
  const suggesting = snapshot.hasTag("suggesting");
  const dirty = snapshot.hasTag("dirty");
  const { done, total } = eventProgress(event);

  useHotkeys([
    { hotkey: "ArrowRight", callback: props.onNext, options: { enabled: !helpOpen } },
    { hotkey: "ArrowLeft", callback: props.onPrev, options: { enabled: !helpOpen } },
    { hotkey: "]", callback: props.onEventNext, options: { enabled: !helpOpen } },
    { hotkey: "[", callback: props.onEventPrev, options: { enabled: !helpOpen } },
    {
      hotkey: "r",
      callback: () => photo.needsRotation && send({ type: "rotation.toggled" }),
      options: { enabled: !helpOpen },
    },
    { hotkey: "Mod+Enter", callback: () => send({ type: "approve" }), options: { enabled: !helpOpen } },
    { hotkey: "a", callback: () => send({ type: "suggestion.applied" }), options: { enabled: !helpOpen } },
    { hotkey: "Shift+/", callback: props.onToggleHelp },
  ]);

  const FILTERS = [
    { value: "any", label: "Alle" },
    { value: "missing_description", label: "Mist beschrijving" },
    { value: "missing_location", label: "Mist locatie" },
  ];

  return (
    <div className="flex h-screen flex-col bg-kumo-base">
      <header className="flex items-center justify-between gap-4 border-b border-kumo-hairline px-6 py-2">
        <Tabs
          variant="underline"
          size="sm"
          value={event.id}
          onValueChange={props.onSelectEvent}
          tabs={events.map((e) => ({ value: e.id, label: e.name }))}
        />
        <div className="flex items-center gap-2">
          <Tabs
            variant="segmented"
            size="sm"
            value={filter}
            onValueChange={props.onSetFilter}
            tabs={FILTERS}
          />
          <Button size="sm" variant="ghost" icon={<KeyboardIcon />} onClick={props.onToggleHelp}>
            <Kbd>?</Kbd>
          </Button>
          <Badge variant="secondary">URL-state</Badge>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 bg-kumo-base p-3">
          <PhotoView photo={photo} rotated={orientationFixed} className="h-full w-full" />
          {photo.needsRotation && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <Button
                variant={orientationFixed ? "secondary" : "primary"}
                size="sm"
                icon={<ArrowClockwiseIcon />}
                onClick={() => send({ type: "rotation.toggled" })}
              >
                {orientationFixed ? "Rechtgezet — ongedaan maken" : "Scheve scan rechtzetten"}
                <Kbd>R</Kbd>
              </Button>
            </div>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col overflow-auto border-t border-kumo-hairline lg:w-96 lg:border-l lg:border-t-0">
          <div className="flex min-h-full flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <Text bold>Bewerken</Text>
              {suggesting ? (
                <Badge variant="info">AI denkt na…</Badge>
              ) : dirty ? (
                <Badge variant="warning" appearance="dot">
                  Niet opgeslagen
                </Badge>
              ) : photoDone(photo) ? (
                <Badge variant="success" appearance="dot">
                  Opgeslagen
                </Badge>
              ) : (
                <Badge variant="neutral" appearance="dot">
                  Nog te doen
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Text bold size="sm">
                  Beschrijving
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<SparkleIcon />}
                  disabled={suggesting}
                  onClick={() => send({ type: "suggestion.applied" })}
                >
                  AI-suggestie <Kbd>A</Kbd>
                </Button>
              </div>
              <button
                type="button"
                onClick={() => !suggesting && send({ type: "suggestion.applied" })}
                className="flex items-start gap-1.5 rounded-lg bg-kumo-recessed p-2.5 text-left transition-colors hover:bg-kumo-fill"
              >
                {suggesting ? (
                  <Loader size="sm" />
                ) : (
                  <SparkleIcon size={14} weight="fill" className="mt-0.5 shrink-0 text-kumo-link" />
                )}
                <Text variant="secondary" size="sm">
                  {suggestion || "AI denkt na…"}
                </Text>
              </button>
              <InputArea
                value={description}
                onChange={(e) => send({ type: "description.changed", value: e.target.value })}
                placeholder="Beschrijf wat je ziet…"
                className="min-h-20"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <Text bold size="sm">
                Locatie
              </Text>
              <LocationSection
                place={place}
                coords={coords}
                aiPlace={aiPlaceSuggestion}
                viewport={props.viewport}
                onViewport={props.onViewport}
                onChange={(p, c) => send({ type: "location.changed", place: p, coords: c })}
              />
            </div>
          </div>
        </aside>
      </div>

      <footer className="relative flex items-center justify-center gap-3 border-t border-kumo-hairline bg-kumo-base px-6 py-2.5">
        <span className="absolute left-6 flex items-center gap-3 text-kumo-subtle">
          <Text variant="secondary" size="sm">
            {done} / {total} klaar
          </Text>
          {props.runningWrites > 0 && (
            <span className="flex items-center gap-1.5">
              <Loader size="sm" />
              <Text variant="secondary" size="sm">
                {props.runningWrites} opslaan…
              </Text>
            </span>
          )}
          {props.runningWrites === 0 && props.savedWrites > 0 && (
            <Badge variant="success" appearance="dot">
              {props.savedWrites} opgeslagen
            </Badge>
          )}
        </span>
        <Button variant="ghost" size="lg" onClick={() => send({ type: "skip" })}>
          Overslaan
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="min-w-64"
          icon={props.hasNext ? <ArrowRightIcon /> : <CheckIcon />}
          onClick={() => send({ type: "approve" })}
        >
          {props.hasNext ? "Opslaan en volgende" : "Opslaan"}
          <Kbd>⌘/Ctrl ↵</Kbd>
        </Button>
      </footer>

      <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-kumo-hairline bg-kumo-elevated p-2">
        {event.photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => props.onPickPhoto(p.id)}
            aria-label={p.id}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${
              p.id === photo.id ? "ring-kumo-brand" : "ring-transparent hover:ring-kumo-line"
            }`}
          >
            <img src={`https://picsum.photos/seed/${p.seed}/120/120`} alt="" className="h-full w-full object-cover" />
            {photoDone(p) && (
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-kumo-success text-kumo-badge-inverted">
                <CheckIcon size={10} weight="bold" />
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog.Root open={helpOpen} onOpenChange={(o) => !o && props.onCloseHelp()}>
        <Dialog size="sm" className="p-6">
          <Dialog.Title className="mb-1 text-lg font-semibold">Sneltoetsen</Dialog.Title>
          <Dialog.Description className="mb-4 text-kumo-subtle">
            Loop foto's na zonder de muis. Event + foto staan in het pad; filter + kaart in de URL.
          </Dialog.Description>
          <div className="flex flex-col gap-2">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-4">
                <Text variant="secondary" size="sm">
                  {s.label}
                </Text>
                {s.keys}
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Dialog.Close render={(p) => <Button variant="secondary" {...p}>Sluiten</Button>} />
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
