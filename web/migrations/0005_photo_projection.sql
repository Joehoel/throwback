ALTER TABLE "library_index_run"
ADD COLUMN "pendingDeltaLink" TEXT NULL;

CREATE TABLE "photo_generation" (
  "libraryId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK ("generation" > 0),
  "photoId" TEXT NOT NULL,
  "eventId" TEXT NULL,
  "fileName" TEXT NULL,
  "reviewability" TEXT NOT NULL CHECK (
    "reviewability" IN ('eligible', 'not_reviewable')
  ),
  "cTag" TEXT NULL,
  "eTag" TEXT NULL,
  "description" TEXT NULL,
  "latitude" REAL NULL CHECK (
    "latitude" IS NULL OR "latitude" BETWEEN -90 AND 90
  ),
  "longitude" REAL NULL CHECK (
    "longitude" IS NULL OR "longitude" BETWEEN -180 AND 180
  ),
  "orientation" INTEGER NULL CHECK (
    "orientation" IS NULL OR "orientation" BETWEEN 1 AND 8
  ),
  "projectionRevision" INTEGER NULL CHECK (
    "projectionRevision" IS NULL OR "projectionRevision" > 0
  ),
  PRIMARY KEY ("libraryId", "generation", "photoId"),
  FOREIGN KEY ("libraryId", "generation", "photoId")
    REFERENCES "drive_item_generation" ("libraryId", "generation", "itemId")
    ON DELETE CASCADE,
  CHECK (
    (
      "reviewability" = 'eligible'
      AND "eventId" IS NOT NULL
      AND "fileName" IS NOT NULL
      AND "cTag" IS NOT NULL
      AND "eTag" IS NOT NULL
      AND "orientation" IS NOT NULL
      AND "projectionRevision" IS NOT NULL
      AND (("latitude" IS NULL AND "longitude" IS NULL)
        OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL))
    )
    OR (
      "reviewability" = 'not_reviewable'
      AND "eventId" IS NULL
      AND "fileName" IS NULL
      AND "cTag" IS NULL
      AND "eTag" IS NULL
      AND "description" IS NULL
      AND "latitude" IS NULL
      AND "longitude" IS NULL
      AND "orientation" IS NULL
      AND "projectionRevision" IS NULL
    )
  )
);

CREATE INDEX "photo_generation_review_queue"
  ON "photo_generation" (
    "libraryId", "generation", "reviewability", "eventId", "photoId"
  );
