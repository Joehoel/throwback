import { describe, expect, it } from "vitest";
import { createActor, fromCallback } from "xstate";
import { photoMachine } from "./photoMachine";
import type { Photo } from "../data";

// Inert suggestion actor for the "no description" tests — keeps the unit tests
// off the network (the real actor POSTs to the Gemini route); we drive the
// suggestion events by hand instead.
const noopSuggestion = fromCallback(() => () => {});
const offline = photoMachine.provide({ actors: { streamSuggestion: noopSuggestion } });

function makePhoto(over: Partial<Photo> = {}): Photo {
  return {
    id: "p1",
    seed: "s1",
    orientation: "landscape",
    aiDescription: "Een mooie foto",
    description: null,
    needsRotation: false,
    rotationFixed: false,
    ...over,
  };
}

const input = (photo: Photo) => ({
  photo,
  place: "Apeldoorn",
  coords: { lat: 1, lng: 2 },
  eventName: "Test-gebeurtenis",
  period: "1998",
});

describe("photoMachine", () => {
  it("enters suggesting on start (runs the AI pass for every photo)", () => {
    const actor = createActor(offline, { input: input(makePhoto()) }).start();
    expect(actor.getSnapshot().matches({ active: "suggesting" })).toBe(true);
    expect(actor.getSnapshot().hasTag("suggesting")).toBe(true);
    actor.stop();
  });

  it("runs the AI pass even when a description already exists", () => {
    const actor = createActor(offline, {
      input: input(makePhoto({ description: "Bestaand" })),
    }).start();
    expect(actor.getSnapshot().matches({ active: "suggesting" })).toBe(true);
    expect(actor.getSnapshot().context.description).toBe("Bestaand"); // draft pre-filled
    actor.stop();
  });

  it("streams the suggestion and lands in editing on complete", () => {
    const actor = createActor(offline, { input: input(makePhoto()) }).start();
    actor.send({ type: "suggestion.delta", text: "Een" });
    expect(actor.getSnapshot().context.suggestion).toBe("Een");
    actor.send({ type: "suggestion.complete", text: "Een mooie foto" });
    expect(actor.getSnapshot().matches({ active: "editing" })).toBe(true);
    expect(actor.getSnapshot().context.suggestion).toBe("Een mooie foto");
    actor.stop();
  });

  it("becomes dirty on edit and applies the suggestion", () => {
    const actor = createActor(offline, { input: input(makePhoto()) }).start();
    actor.send({ type: "suggestion.complete", text: "Een mooie foto" });
    expect(actor.getSnapshot().hasTag("dirty")).toBe(false);
    actor.send({ type: "suggestion.applied" });
    expect(actor.getSnapshot().hasTag("dirty")).toBe(true);
    expect(actor.getSnapshot().context.description).toBe("Een mooie foto");
    actor.stop();
  });

  it("records the AI place-name guess without changing the draft", () => {
    const actor = createActor(offline, {
      input: input(makePhoto({ description: "x" })),
    }).start();
    actor.send({ type: "location.suggested", place: "Londen, VK" });
    expect(actor.getSnapshot().context.aiPlaceSuggestion).toBe("Londen, VK");
    expect(actor.getSnapshot().context.place).toBe("Apeldoorn"); // draft untouched until applied
    expect(actor.getSnapshot().hasTag("dirty")).toBe(false);
    actor.stop();
  });

  it("toggles rotation", () => {
    const actor = createActor(offline, {
      input: input(makePhoto({ description: "x", needsRotation: true })),
    }).start();
    actor.send({ type: "rotation.toggled" });
    expect(actor.getSnapshot().context.orientationFixed).toBe(true);
    actor.stop();
  });

  it("returns an approved output with the current draft", () => {
    const actor = createActor(offline, {
      input: input(makePhoto({ description: "Bestaand" })),
    }).start();
    actor.send({ type: "description.changed", value: "Nieuwe tekst" });
    actor.send({ type: "approve" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe("done");
    expect(snapshot.output).toEqual({
      decision: "approved",
      description: "Nieuwe tekst",
      place: "Apeldoorn",
      coords: { lat: 1, lng: 2 },
      orientationFixed: false,
    });
  });

  it("returns a skipped output", () => {
    const actor = createActor(offline, {
      input: input(makePhoto({ description: "Bestaand" })),
    }).start();
    actor.send({ type: "skip" });
    expect(actor.getSnapshot().output).toEqual({ decision: "skipped" });
    actor.stop();
  });
});
