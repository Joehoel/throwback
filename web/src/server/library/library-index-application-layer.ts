import { env } from "cloudflare:workers";
import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Layer } from "effect";
import { LibraryIndexLive } from "./library-index.ts";
import { LibraryIndexStoreLive } from "./library-index-store.ts";
import { ServiceBindingLibraryIndexDispatcherLive } from "./service-binding-library-index-dispatcher.ts";

const StoreLive = LibraryIndexStoreLive.pipe(Layer.provide(d1Layer({ db: env.DB })));

/** Production application policy with durable D1 state and private Workflow dispatch. */
export const LibraryIndexApplicationLive = LibraryIndexLive.pipe(
  Layer.provide([StoreLive, ServiceBindingLibraryIndexDispatcherLive]),
);

export { LibraryIndex } from "./library-index.ts";
