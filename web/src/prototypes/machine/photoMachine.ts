/**
 * photoMachine — the edit lifecycle of ONE photo (the child actor invoked by
 * reviewMachine). Owns: the AI suggestion stream, the description/location/
 * rotation drafts, and the pristine→dirty edit state. It does NOT save: on
 * `approve`/`skip` it reaches a final state and hands its decision + payload up
 * via `output`; the parent decides which writes to enqueue (domain-model §5).
 *
 * Terms follow the glossary (ADR-0013, English): Description, Suggestion,
 * Location. `Suggestion` is a separate concept from the approved `Description`
 * (ADR-0002) — applying it just copies it into the draft.
 */
import { assign, fromCallback, setup } from "xstate";
import type { LatLng, Photo } from "../data";

export interface PhotoInput {
  photo: Photo;
  /** seed location from the Event (one point per folder; per-photo override allowed) */
  place: string;
  coords: LatLng;
  /** Event context — fed to Gemini as a hint for the place guess (ADR-0008). */
  eventName: string;
  period: string;
}

export interface PhotoContext {
  photo: Photo;
  description: string;
  suggestion: string;
  place: string;
  coords: LatLng;
  orientationFixed: boolean;
  eventName: string;
  period: string;
  /** Gemini's place-name guess (name only — client geocodes to lat/lon). */
  aiPlaceSuggestion: string | null;
  decision: "pending" | "approved" | "skipped";
}

export type PhotoOutput =
  | {
      decision: "approved";
      description: string;
      place: string;
      coords: LatLng;
      orientationFixed: boolean;
    }
  | { decision: "skipped" };

export type PhotoEvent =
  | { type: "suggestion.delta"; text: string }
  | { type: "suggestion.complete"; text: string }
  | { type: "location.suggested"; place: string | null }
  | { type: "description.changed"; value: string }
  | { type: "suggestion.applied" }
  | { type: "location.changed"; place: string; coords: LatLng }
  | { type: "rotation.toggled" }
  | { type: "approve" }
  | { type: "skip" };

/**
 * The real TanStack AI suggestion: POST to the Worker route which calls Gemini
 * (@tanstack/ai + @tanstack/ai-gemini). The returned caption is then animated
 * word-by-word for the streaming feel. If the endpoint fails (no GEMINI_API_KEY,
 * or an AI error) it falls back to the canned `aiDescription`, so the prototype
 * keeps working without a key. `sendBack` delivers events to the photoMachine.
 */
type SuggestInput = { photo: Photo; eventName: string; period: string };

const streamSuggestion = fromCallback<PhotoEvent, SuggestInput>(({ input, sendBack }) => {
  let handle: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const animate = (full: string): void => {
    if (cancelled) return;
    const words = full.split(" ");
    let i = 0;
    handle = setInterval(() => {
      i += 1;
      if (i >= words.length) {
        clearInterval(handle);
        sendBack({ type: "suggestion.complete", text: full });
      } else {
        sendBack({ type: "suggestion.delta", text: words.slice(0, i).join(" ") });
      }
    }, 70);
  };

  fetch("/prototypes/api/suggest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      seed: input.photo.seed,
      orientation: input.photo.orientation,
      eventName: input.eventName,
      period: input.period,
    }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { description?: string; place?: string | null }) => {
      if (cancelled) return;
      // Gemini's place-name guess (name only; the client geocodes it).
      sendBack({ type: "location.suggested", place: d.place ?? null });
      animate(d.description?.trim() || input.photo.aiDescription);
    })
    .catch(() => animate(input.photo.aiDescription));

  return () => {
    cancelled = true;
    if (handle) clearInterval(handle);
  };
});

export const photoMachine = setup({
  types: {
    context: {} as PhotoContext,
    events: {} as PhotoEvent,
    input: {} as PhotoInput,
    output: {} as PhotoOutput,
  },
  actors: { streamSuggestion },
}).createMachine({
  id: "photo",
  context: ({ input }) => ({
    photo: input.photo,
    description: input.photo.description ?? "",
    suggestion: "",
    place: input.place,
    coords: input.coords,
    orientationFixed: input.photo.rotationFixed,
    eventName: input.eventName,
    period: input.period,
    aiPlaceSuggestion: null,
    decision: "pending",
  }),
  initial: "deciding",
  states: {
    deciding: {
      // Always run the AI pass — it yields both the caption suggestion and the
      // place guess (ADR-0008), regardless of whether a Description exists yet.
      always: { target: "active.suggesting" },
    },
    active: {
      initial: "suggesting",
      states: {
        suggesting: {
          tags: ["suggesting"],
          invoke: {
            src: "streamSuggestion",
            input: ({ context }) => ({
              photo: context.photo,
              eventName: context.eventName,
              period: context.period,
            }),
          },
          on: {
            "suggestion.delta": {
              actions: assign({ suggestion: ({ event }) => event.text }),
            },
            "suggestion.complete": {
              target: "editing",
              actions: assign({ suggestion: ({ event }) => event.text }),
            },
          },
        },
        editing: {
          initial: "pristine",
          states: {
            pristine: {},
            dirty: { tags: ["dirty"] },
          },
        },
      },
      on: {
        // Internal: just record Gemini's place guess (the user applies it from
        // the location panel, which geocodes the name to coordinates).
        "location.suggested": {
          actions: assign({ aiPlaceSuggestion: ({ event }) => event.place }),
        },
        "description.changed": {
          target: ".editing.dirty",
          actions: assign({ description: ({ event }) => event.value }),
        },
        "suggestion.applied": {
          target: ".editing.dirty",
          actions: assign({ description: ({ context }) => context.suggestion }),
        },
        "location.changed": {
          target: ".editing.dirty",
          actions: assign({
            place: ({ event }) => event.place,
            coords: ({ event }) => event.coords,
          }),
        },
        "rotation.toggled": {
          target: ".editing.dirty",
          actions: assign({ orientationFixed: ({ context }) => !context.orientationFixed }),
        },
      },
    },
    approved: { type: "final" },
    skipped: { type: "final" },
  },
  on: {
    approve: { target: ".approved", actions: assign({ decision: () => "approved" as const }) },
    skip: { target: ".skipped", actions: assign({ decision: () => "skipped" as const }) },
  },
  output: ({ context }) =>
    context.decision === "skipped"
      ? { decision: "skipped" }
      : {
          decision: "approved",
          description: context.description,
          place: context.place,
          coords: context.coords,
          orientationFixed: context.orientationFixed,
        },
});
