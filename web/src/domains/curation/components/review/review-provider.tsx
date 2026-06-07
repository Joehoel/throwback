import { createContext, use, useEffect, useEffectEvent } from "react";
import { useMachine } from "@xstate/react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { eventProgress } from "#/domains/curation/data.ts";
import type { LatLng, Photo, ThrowbackEvent } from "#/domains/curation/data.ts";
import { photoMachine } from "#/domains/curation/machine/photo-machine.ts";
import type { PhotoOutput } from "#/domains/curation/machine/photo-machine.ts";
import type { Viewport } from "#/domains/curation/components/location-picker.tsx";

/**
 * Shared state + actions for the review screen, dependency-injected by the
 * provider. The compound `Review.*` parts read this via `use(ReviewContext)`
 * instead of taking a long prop list (composition over prop drilling).
 */
export interface ReviewContextValue {
  // data
  photo: Photo;
  event: ThrowbackEvent;
  events: ThrowbackEvent[];
  // per-photo edit state (owned by the photoMachine)
  description: string;
  suggestion: string;
  place: string;
  coords: LatLng;
  orientationFixed: boolean;
  aiPlaceSuggestion: string | null;
  suggesting: boolean;
  // progress + layout
  done: number;
  total: number;
  hasNext: boolean;
  viewport?: Viewport;
  runningWrites: number;
  savedWrites: number;
  helpOpen: boolean;
  // edit actions (decoupled from the machine's event shape)
  setDescription: (value: string) => void;
  applySuggestion: () => void;
  toggleRotation: () => void;
  changeLocation: (place: string, coords: LatLng) => void;
  approve: () => void;
  skip: () => void;
  // navigation + chrome
  prev: () => void;
  next: () => void;
  eventPrev: () => void;
  eventNext: () => void;
  selectEvent: (id: string) => void;
  pickPhoto: (id: string) => void;
  setViewport: (v: Viewport) => void;
  toggleHelp: () => void;
  closeHelp: () => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

/** Read the review context; throws if used outside `Review.Provider`. */
export function useReview(): ReviewContextValue {
  const ctx = use(ReviewContext);
  if (!ctx) {
    throw new Error("Review.* components must be rendered inside <Review.Provider>");
  }
  return ctx;
}

export interface ReviewProviderProps {
  photo: Photo;
  event: ThrowbackEvent;
  events: ThrowbackEvent[];
  viewport?: Viewport;
  runningWrites: number;
  savedWrites: number;
  hasNext: boolean;
  helpOpen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onEventPrev: () => void;
  onEventNext: () => void;
  onSelectEvent: (id: string) => void;
  onPickPhoto: (id: string) => void;
  onViewport: (v: Viewport) => void;
  onToggleHelp: () => void;
  onCloseHelp: () => void;
  onCommit: (out: PhotoOutput) => void;
  children: React.ReactNode;
}

export function ReviewProvider({
  photo,
  event,
  events,
  viewport,
  runningWrites,
  savedWrites,
  hasNext,
  helpOpen,
  onPrev,
  onNext,
  onEventPrev,
  onEventNext,
  onSelectEvent,
  onPickPhoto,
  onViewport,
  onToggleHelp,
  onCloseHelp,
  onCommit,
  children,
}: ReviewProviderProps): React.ReactNode {
  const [snapshot, send] = useMachine(photoMachine, {
    input: {
      photo,
      place: event.location ?? event.aiPlace,
      coords: event.coords,
      eventName: event.name,
      period: event.period,
    },
  });

  // Commit when the machine reaches its terminal state. `commit` is an effect
  // event so the effect depends only on the machine status — no stale closure,
  // no re-fire on unrelated prop changes. Forwarding an actor's final `output`
  // to the orchestrator is the standard @xstate/react integration (the photo
  // machine is the source of truth; the commit it triggers navigates, which
  // remounts this provider anyway) — react-doctor's effect→parent heuristic
  // doesn't model state-machine actors, so it's disabled for this one line.
  const commit = useEffectEvent(() => {
    if (snapshot.status === "done") {
      onCommit(snapshot.output);
    }
  });
  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-pass-data-to-parent
    commit();
  }, [snapshot.status]);

  useHotkeys([
    { hotkey: "ArrowRight", callback: onNext, options: { enabled: !helpOpen } },
    { hotkey: "ArrowLeft", callback: onPrev, options: { enabled: !helpOpen } },
    { hotkey: "]", callback: onEventNext, options: { enabled: !helpOpen } },
    { hotkey: "[", callback: onEventPrev, options: { enabled: !helpOpen } },
    {
      hotkey: "r",
      callback: () => {
        if (photo.needsRotation) {
          send({ type: "rotation.toggled" });
        }
      },
      options: { enabled: !helpOpen },
    },
    {
      hotkey: "Mod+Enter",
      callback: () => {
        send({ type: "approve" });
      },
      options: { enabled: !helpOpen },
    },
    {
      hotkey: "a",
      callback: () => {
        send({ type: "suggestion.applied" });
      },
      options: { enabled: !helpOpen },
    },
    { hotkey: "Shift+/", callback: onToggleHelp },
  ]);

  const { description, suggestion, place, coords, orientationFixed, aiPlaceSuggestion } =
    snapshot.context;
  const { done, total } = eventProgress(event);

  const value: ReviewContextValue = {
    photo,
    event,
    events,
    description,
    suggestion,
    place,
    coords,
    orientationFixed,
    aiPlaceSuggestion,
    suggesting: snapshot.hasTag("suggesting"),
    done,
    total,
    hasNext,
    viewport,
    runningWrites,
    savedWrites,
    helpOpen,
    setDescription: (val) => {
      send({ type: "description.changed", value: val });
    },
    applySuggestion: () => {
      send({ type: "suggestion.applied" });
    },
    toggleRotation: () => {
      send({ type: "rotation.toggled" });
    },
    changeLocation: (p, c) => {
      send({ type: "location.changed", place: p, coords: c });
    },
    approve: () => {
      send({ type: "approve" });
    },
    skip: () => {
      send({ type: "skip" });
    },
    prev: onPrev,
    next: onNext,
    eventPrev: onEventPrev,
    eventNext: onEventNext,
    selectEvent: onSelectEvent,
    pickPhoto: onPickPhoto,
    setViewport: onViewport,
    toggleHelp: onToggleHelp,
    closeHelp: onCloseHelp,
  };

  return <ReviewContext value={value}>{children}</ReviewContext>;
}
