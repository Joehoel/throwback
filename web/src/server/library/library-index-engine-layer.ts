import { Layer } from "effect";
import { CuratorStore } from "../curator/curator-store.ts";
import type { CuratorStoreService } from "../curator/curator-store.ts";
import { PhotoStore } from "../photo/photo-store.ts";
import type { PhotoStoreService } from "../photo/photo-store.ts";
import { LibraryIndexEngineLive } from "./library-index-engine.ts";
import { libraryIndexGraphLayer } from "./library-index-graph-layer.ts";
import type { LibraryIndexRuntimeOptions } from "./library-index-runtime-options.ts";
import { LibraryIndexStore } from "./library-index-store.ts";
import type { LibraryIndexStoreService } from "./library-index-store.ts";

interface LibraryIndexStores {
  readonly curator: CuratorStoreService;
  readonly index: LibraryIndexStoreService;
  readonly photo: PhotoStoreService;
}

/** Assemble the server-only dependencies for one Workflow index step. */
export function libraryIndexEngineLayer(
  options: LibraryIndexRuntimeOptions,
  stores: LibraryIndexStores,
) {
  return LibraryIndexEngineLive.pipe(
    Layer.provide([
      Layer.succeed(LibraryIndexStore, stores.index),
      Layer.succeed(CuratorStore, stores.curator),
      Layer.succeed(PhotoStore, stores.photo),
      libraryIndexGraphLayer(options, stores.curator),
    ]),
  );
}

export type { LibraryIndexRuntimeOptions } from "./library-index-runtime-options.ts";
