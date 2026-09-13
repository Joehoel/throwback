import { is } from "valibot";
import {
  vCuratorClaimRequired,
  vGraphConnectionRequired,
  vLibraryIndexing,
  vLibrarySelectionRequired,
  vSignInRequired,
} from "../generated/valibot.gen.ts";
import { linkOptions } from "@tanstack/react-router";
import type { BootstrapState } from "../generated/types.gen.ts";

export function bootstrapDestination(state: BootstrapState) {
  if ("libraryId" in state) {
    return linkOptions({
      to: "/libraries/$libraryId/events/$eventId/photos/$photoId",
      params: {
        libraryId: state.libraryId,
        eventId: state.eventId,
        photoId: state.photoId,
      },
    });
  }

  if (is(vSignInRequired, state)) {
    return linkOptions({ to: "/sign-in" });
  }

  let step: string;

  if (is(vCuratorClaimRequired, state)) {
    step = "claim";
  } else if (is(vGraphConnectionRequired, state)) {
    step = "graph";
  } else if (is(vLibrarySelectionRequired, state)) {
    step = "library";
  } else if (is(vLibraryIndexing, state)) {
    step = "indexing";
  } else {
    throw new Error("Generated BootstrapState contains an unsupported setup variant");
  }

  return linkOptions({
    to: "/setup/$step",
    params: { step },
  });
}
