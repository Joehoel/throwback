import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { layer as d1Layer } from "@effect/sql-d1/D1Client";
import { Layer, Option } from "effect";
import { MicrosoftAccountId } from "../curator/model.ts";
import { sqliteD1Database } from "../test-support/sqlite-d1.ts";
import { DriveNode, IndexRunId, IndexWorkflowInstanceId } from "./library-index-model.ts";
import { LibraryIndexStoreLive } from "./library-index-store.ts";
import { DriveId, DriveItemId, LibraryId } from "./model.ts";

const migrationPaths = [
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
  new URL("../../../migrations/0002_library.sql", import.meta.url),
  new URL("../../../migrations/0003_library_index.sql", import.meta.url),
].map((url) => fileURLToPath(url));

export function makeIndexDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");

  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"));
  }

  database.exec(`
    INSERT INTO "curator_owner" ("singleton", "providerId", "providerAccountId")
    VALUES (1, 'microsoft', 'owner-oid');
    INSERT INTO "library" (
      "singleton", "id", "curatorProviderId", "curatorProviderAccountId",
      "driveId", "rootDriveItemId", "rootName", "rootPath"
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000045', 'microsoft', 'owner-oid',
      'drive-a', 'selected-root', 'Familiefoto''s', 'OneDrive / Familiefoto''s'
    );
  `);

  return database;
}

export function indexStoreLayer(database: DatabaseSync) {
  return LibraryIndexStoreLive.pipe(Layer.provide(d1Layer({ db: sqliteD1Database(database) })));
}

export const indexLibrary = {
  id: LibraryId.make("00000000-0000-4000-8000-000000000045"),
  curatorProviderAccountId: MicrosoftAccountId.make("owner-oid"),
  driveId: DriveId.make("drive-a"),
  rootDriveItemId: DriveItemId.make("selected-root"),
  root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
};

export const indexRunId = IndexRunId.make("00000000-0000-4000-8000-000000000101");

export const indexWorkflowId = IndexWorkflowInstanceId.make("workflow-a");

export function indexNode(options: {
  readonly id: string;
  readonly parentId?: string;
  readonly nodeType: "file" | "folder" | "other";
  readonly tombstone?: boolean;
}) {
  return DriveNode.make({
    id: DriveItemId.make(options.id),
    parentId: Option.fromNullishOr(options.parentId).pipe(Option.map((id) => DriveItemId.make(id))),
    nodeType: options.nodeType,
    tombstone: options.tombstone ?? false,
  });
}
