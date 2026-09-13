import { Layer } from "effect";
import { GraphAccessTokenLive } from "./graph-token.ts";
import { MicrosoftGraphApiLive } from "./microsoft-graph-api.ts";
import { MicrosoftGraphLive } from "./microsoft-graph.ts";

/** OneDrive folder operations with their token and HTTP adapters. */
export const MicrosoftGraphLayer = MicrosoftGraphLive.pipe(
  Layer.provide([GraphAccessTokenLive, MicrosoftGraphApiLive]),
);
