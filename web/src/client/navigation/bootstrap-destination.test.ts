import { parse } from "valibot";
import { describe, expect, it } from "vitest";
import { vBootstrapState } from "../generated/valibot.gen.ts";
import { bootstrapDestination } from "./bootstrap-destination.ts";

describe("bootstrap destination", () => {
  it.each([
    [JSON.parse('{"_tag":"SignInRequired"}'), { to: "/sign-in" }],
    [
      JSON.parse('{"_tag":"CuratorClaimRequired"}'),
      { to: "/setup/$step", params: { step: "claim" } },
    ],
    [
      JSON.parse('{"_tag":"GraphConnectionRequired"}'),
      { to: "/setup/$step", params: { step: "graph" } },
    ],
    [
      JSON.parse('{"_tag":"LibrarySelectionRequired"}'),
      { to: "/setup/$step", params: { step: "library" } },
    ],
    [
      JSON.parse('{"_tag":"LibraryIndexing","discoveredPhotos":42}'),
      { to: "/setup/$step", params: { step: "indexing" } },
    ],
  ])("routes %o from server-confirmed state", (input, expected) => {
    expect(bootstrapDestination(parse(vBootstrapState, input))).toEqual(expected);
  });

  it("constructs the canonical review bookmark from generated branded ids", () => {
    const state = parse(
      vBootstrapState,
      JSON.parse(
        '{"_tag":"ReviewReady","libraryId":"library-1","eventId":"event-1","photoId":"photo-1"}',
      ),
    );

    expect(bootstrapDestination(state)).toEqual({
      to: "/libraries/$libraryId/events/$eventId/photos/$photoId",
      params: { libraryId: "library-1", eventId: "event-1", photoId: "photo-1" },
    });
  });
});
