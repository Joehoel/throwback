import { is } from "valibot";
import {
  vCuratorClaimRequired,
  vGraphConnectionRequired,
  vLibraryIndexing,
  vLibrarySelectionRequired,
  vSignInRequired,
} from "../generated/valibot.gen.ts";
import type { BootstrapState } from "../generated/types.gen.ts";

export type BootstrapDestination =
  | { readonly to: "/sign-in" }
  | { readonly to: "/setup/$step"; readonly params: { readonly step: string } }
  | {
      readonly to: "/libraries/$libraryId/events/$eventId/photos/$photoId";
      readonly params: {
        readonly libraryId: string;
        readonly eventId: string;
        readonly photoId: string;
      };
    };

export function bootstrapDestination(state: BootstrapState): BootstrapDestination {
  if ("libraryId" in state) {
    return {
      to: "/libraries/$libraryId/events/$eventId/photos/$photoId",
      params: {
        libraryId: state.libraryId,
        eventId: state.eventId,
        photoId: state.photoId,
      },
    };
  }

  if (is(vSignInRequired, state)) {
    return { to: "/sign-in" };
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

  return {
    to: "/setup/$step",
    params: { step },
  };
}
