import { useMachine } from "@xstate/react";
import { render } from "@testing-library/react";
import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { fromCallback } from "xstate";
import type { Photo } from "../data";
import { photoMachine } from "./photoMachine";

/**
 * Browser test (@vitest/browser + Playwright/chromium): drive the *real*
 * photoMachine through @xstate/react in a real browser, interacting via real DOM
 * events. This is the integration the unit/model tests can't cover — that the
 * machine ↔ React binding actually renders and reacts to clicks in a browser
 * engine. The Gemini suggestion actor is stubbed inert; the UI sends the
 * suggestion events itself.
 */

const offline = photoMachine.provide({
  actors: { streamSuggestion: fromCallback(() => () => {}) },
});

const photo: Photo = {
  id: "p1",
  seed: "s1",
  orientation: "landscape",
  aiDescription: "Een mooie foto",
  description: null,
  needsRotation: false,
  rotationFixed: false,
};

const input = {
  photo,
  place: "Apeldoorn",
  coords: { lat: 1, lng: 2 },
  eventName: "Test-gebeurtenis",
  period: "1998",
};

// A minimal editor bound to the machine — the smallest surface that exercises the
// suggesting → editing → approved/skipped flow through the DOM.
function PhotoEditor() {
  const [snapshot, send] = useMachine(offline, { input });

  if (snapshot.status === "done") {
    return <div data-testid="output">{JSON.stringify(snapshot.output)}</div>;
  }

  return (
    <div>
      <p data-testid="state">{JSON.stringify(snapshot.value)}</p>
      <p data-testid="description">{snapshot.context.description}</p>
      <button
        type="button"
        onClick={() => send({ type: "suggestion.complete", text: "Een mooie foto" })}
      >
        Complete suggestion
      </button>
      <button type="button" onClick={() => send({ type: "suggestion.applied" })}>
        Apply suggestion
      </button>
      <button type="button" onClick={() => send({ type: "approve" })}>
        Approve
      </button>
      <button type="button" onClick={() => send({ type: "skip" })}>
        Skip
      </button>
    </div>
  );
}

describe("photoMachine in the browser", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("streams a suggestion, applies it, and approves to an approved decision", async () => {
    render(<PhotoEditor />);

    // Starts in the suggesting sub-state (the AI pass runs for every photo).
    await expect.element(page.getByTestId("state")).toHaveTextContent("suggesting");

    await userEvent.click(page.getByRole("button", { name: "Complete suggestion" }));
    await expect.element(page.getByTestId("state")).toHaveTextContent("editing");

    await userEvent.click(page.getByRole("button", { name: "Apply suggestion" }));
    await expect.element(page.getByTestId("description")).toHaveTextContent("Een mooie foto");

    await userEvent.click(page.getByRole("button", { name: "Approve" }));
    await expect.element(page.getByTestId("output")).toHaveTextContent("approved");
    await expect.element(page.getByTestId("output")).toHaveTextContent("Een mooie foto");
  });

  it("skips to a skipped decision", async () => {
    render(<PhotoEditor />);

    await userEvent.click(page.getByRole("button", { name: "Skip" }));
    await expect.element(page.getByTestId("output")).toHaveTextContent("skipped");
  });
});
