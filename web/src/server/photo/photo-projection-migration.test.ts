import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
  new URL("../../../migrations/0002_library.sql", import.meta.url),
  new URL("../../../migrations/0003_library_index.sql", import.meta.url),
  new URL("../../../migrations/0004_library_index_resume.sql", import.meta.url),
].map((url) => fileURLToPath(url));

const photoProjectionMigration = fileURLToPath(
  new URL("../../../migrations/0005_photo_projection.sql", import.meta.url),
);

describe("Foto projection migration", () => {
  it("invalidates a skeleton-only active generation while preserving its Hoofdmap", () => {
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
        1, '00000000-0000-4000-8000-000000000046', 'microsoft', 'owner-oid',
        'drive-a', 'selected-root', 'Familiefoto''s', 'OneDrive / Familiefoto''s'
      );
      INSERT INTO "library_index_run" (
        "libraryId", "runId", "generation", "status", "graphConnectionVersion",
        "deltaLink", "activeGeneration"
      ) VALUES (
        '00000000-0000-4000-8000-000000000046', 'old-run', 1, 'active', 'connection-v1',
        'https://graph.example.test/old-delta', 1
      );
      INSERT INTO "drive_item_generation" (
        "libraryId", "generation", "itemId", "parentItemId", "nodeType", "tombstone"
      ) VALUES (
        '00000000-0000-4000-8000-000000000046', 1, 'selected-root', NULL, 'folder', 0
      );
    `);

    database.exec(readFileSync(photoProjectionMigration, "utf8"));

    const libraryCount = database.prepare('SELECT COUNT(*) AS "count" FROM "library"').get();
    const runCount = database.prepare('SELECT COUNT(*) AS "count" FROM "library_index_run"').get();

    const itemCount = database
      .prepare('SELECT COUNT(*) AS "count" FROM "drive_item_generation"')
      .get();

    expect(libraryCount).toEqual({ count: 1 });
    expect(runCount).toEqual({ count: 0 });
    expect(itemCount).toEqual({ count: 0 });
  });
});
