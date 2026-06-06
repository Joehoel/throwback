import { getShortestPaths } from "@xstate/graph";
import { describe, expect, it } from "vitest";
import { createActor, fromCallback } from "xstate";
import type { Photo } from "../data";
import { photoMachine } from "./photoMachine";
import type { PhotoEvent } from "./photoMachine";

/**
 * Model-based tests for photoMachine (@xstate/graph). Where photoMachine.test.ts
 * asserts hand-picked scenarios, this derives *every* shortest path through the
 * statechart and replays each against a real actor — so the model (the graph) and
 * the implementation (the running machine) are proven to agree, and we get
 * state/transition coverage for free.
 *
 * The suggestion actor is stubbed inert (the real one POSTs to the Gemini route);
 * the graph drives `suggestion.complete` itself from the events list below.
 */

const noopSuggestion = fromCallback(() => () => {});
const offline = photoMachine.provide({ actors: { streamSuggestion: noopSuggestion } });

const makePhoto = (over: Partial<Photo> = {}): Photo => ({
  id: "p1",
  seed: "s1",
  orientation: "landscape",
  aiDescription: "Een mooie foto",
  description: null,
  needsRotation: false,
  rotationFixed: false,
  ...over,
});

const input = {
  photo: makePhoto(),
  place: "Apeldoorn",
  coords: { lat: 1, lng: 2 },
  eventName: "Test-gebeurtenis",
  period: "1998",
};

// One representative payload per event type — enough to exercise every transition.
const events: PhotoEvent[] = [
  { type: "suggestion.delta", text: "Een" },
  { type: "suggestion.complete", text: "Een mooie foto" },
  { type: "location.suggested", place: "Londen, VK" },
  { type: "description.changed", value: "Nieuwe tekst" },
  { type: "suggestion.applied" },
  { type: "location.changed", place: "Parijs", coords: { lat: 48, lng: 2 } },
  { type: "rotation.toggled" },
  { type: "approve" },
  { type: "skip" },
];

const paths = getShortestPaths(offline, { input, events });

describe("photoMachine (model-based)", () => {
  it("explores a non-trivial set of shortest paths", () => {
    expect(paths.length).toBeGreaterThan(10);
  });

  it("can reach both terminal decisions (approved and skipped)", () => {
    const terminals = new Set(
      paths.filter((p) => p.state.status === "done").map((p) => JSON.stringify(p.state.value)),
    );
    expect(terminals).toContain(JSON.stringify("approved"));
    expect(terminals).toContain(JSON.stringify("skipped"));
  });

  it("exercises every declared event across the explored paths", () => {
    const seen = new Set(
      paths
        .flatMap((p) => p.steps.map((s) => s.event.type))
        .filter((t) => !t.startsWith("xstate.")),
    );
    for (const event of events) expect(seen).toContain(event.type);
  });

  it.each(paths.map((p, i) => [i, p] as const))(
    "path %i replays to the model's predicted state",
    (_i, path) => {
      const actor = createActor(offline, { input }).start();
      for (const step of path.steps) {
        if (step.event.type.startsWith("xstate.")) continue; // init is implied by .start()
        actor.send(step.event);
      }
      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toEqual(path.state.value);
      expect(snapshot.status).toBe(path.state.status);
      actor.stop();
    },
  );
});
