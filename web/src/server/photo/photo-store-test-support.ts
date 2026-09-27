import type { DatabaseSync } from "node:sqlite";
import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Layer } from "effect";
import { sqliteD1Database } from "../test-support/sqlite-d1.ts";
import { LibraryStoreLive } from "../library/library-store.ts";
import { PhotoStoreLive } from "./photo-store.ts";

/** Build the real Foto projection store over an in-memory SQLite D1 substitute. */
export function photoStoreLayer(database: DatabaseSync) {
  return PhotoStoreLive.pipe(Layer.provide(d1Layer({ db: sqliteD1Database(database) })));
}

/** Build the selected-Bibliotheek store over an in-memory SQLite D1 substitute. */
export function libraryStoreLayer(database: DatabaseSync) {
  return LibraryStoreLive.pipe(Layer.provide(d1Layer({ db: sqliteD1Database(database) })));
}
