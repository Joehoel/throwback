CREATE TABLE "library_index_run" (
  "libraryId" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL UNIQUE,
  "generation" INTEGER NOT NULL CHECK ("generation" > 0),
  "status" TEXT NOT NULL CHECK (
    "status" IN (
      'queued',
      'running',
      'retrying',
      'waiting_for_reauthentication',
      'failed',
      'active'
    )
  ),
  "workflowInstanceId" TEXT NULL,
  "nextLink" TEXT NULL,
  "deltaLink" TEXT NULL,
  "activeGeneration" INTEGER NULL CHECK (
    "activeGeneration" IS NULL OR "activeGeneration" > 0
  ),
  "pagesProcessed" INTEGER NOT NULL DEFAULT 0 CHECK ("pagesProcessed" >= 0),
  "processedItems" INTEGER NOT NULL DEFAULT 0 CHECK ("processedItems" >= 0),
  "startedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("libraryId") REFERENCES "library" ("id") ON DELETE CASCADE
);

CREATE TABLE "drive_item_generation" (
  "libraryId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK ("generation" > 0),
  "itemId" TEXT NOT NULL,
  "parentItemId" TEXT NULL,
  "nodeType" TEXT NOT NULL CHECK ("nodeType" IN ('folder', 'file', 'other')),
  "tombstone" INTEGER NOT NULL CHECK ("tombstone" IN (0, 1)),
  PRIMARY KEY ("libraryId", "generation", "itemId"),
  FOREIGN KEY ("libraryId") REFERENCES "library" ("id") ON DELETE CASCADE
);

CREATE INDEX "drive_item_generation_parent"
  ON "drive_item_generation" ("libraryId", "generation", "parentItemId");
