import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { CuratorIdentity, MicrosoftAccountId } from "../curator/model.ts";
import { sqliteD1Database } from "../test-support/sqlite-d1.ts";
import { LibraryStore, LibraryStoreLive } from "./library-store.ts";
import { DriveId, DriveItemId, LibraryId } from "./model.ts";

const migrationPaths = [
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
  new URL("../../../migrations/0002_library.sql", import.meta.url),
].map((url) => fileURLToPath(url));

function makeMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");

  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"));
  }

  database
    .prepare(
      `INSERT INTO "curator_owner" ("singleton", "providerId", "providerAccountId")
       VALUES (1, 'microsoft', 'owner-oid')`,
    )
    .run();

  return database;
}

function storeLayer(database: DatabaseSync) {
  return LibraryStoreLive.pipe(Layer.provide(D1Client.layer({ db: sqliteD1Database(database) })));
}

const curator = CuratorIdentity.make({
  providerId: "microsoft",
  providerAccountId: MicrosoftAccountId.make("owner-oid"),
});

const firstSelection = {
  id: LibraryId.make("00000000-0000-4000-8000-000000000001"),
  curatorProviderAccountId: curator.providerAccountId,
  driveId: DriveId.make("drive-a"),
  rootDriveItemId: DriveItemId.make("folder-a"),
  root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
};

describe("Effect SQL D1 Library store", () => {
  it("stores and decodes the selected DriveId and DriveItemId", async () => {
    const database = makeMigratedDatabase();

    const selected = await Effect.runPromise(
      LibraryStore.pipe(
        Effect.flatMap((store) => store.select(firstSelection)),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(selected).toEqual(firstSelection);

    const reread = await Effect.runPromise(
      LibraryStore.pipe(
        Effect.flatMap((store) => store.getSelected(curator)),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(Option.getOrThrow(reread)).toEqual(firstSelection);
  });

  it("keeps the first selection when a competing Hoofdmap is submitted", async () => {
    const database = makeMigratedDatabase();

    const competingSelection = {
      ...firstSelection,
      id: LibraryId.make("00000000-0000-4000-8000-000000000002"),
      rootDriveItemId: DriveItemId.make("folder-b"),
      root: { name: "Other", path: "OneDrive / Other" },
    };

    const selected = await Effect.runPromise(
      LibraryStore.pipe(
        Effect.flatMap((store) =>
          Effect.all([store.select(firstSelection), store.select(competingSelection)], {
            concurrency: "unbounded",
          }),
        ),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(selected).toEqual([firstSelection, firstSelection]);
    expect(database.prepare('SELECT COUNT(*) AS "count" FROM "library"').get()).toEqual({
      count: 1,
    });
  });
});
