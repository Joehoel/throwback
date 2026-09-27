import { env } from "cloudflare:workers";
import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Layer } from "effect";
import { CuratorStoreLive } from "./curator/curator-store.ts";
import { LibraryStoreLive } from "./library/library-store.ts";
import { PhotoStoreLive } from "./photo/photo-store.ts";

/** Production D1 persistence shared by request-scoped application services. */
export const PersistenceLive = Layer.mergeAll(
  CuratorStoreLive,
  LibraryStoreLive,
  PhotoStoreLive,
).pipe(Layer.provide(d1Layer({ db: env.DB })));

export { PhotoStore } from "./photo/photo-store.ts";
