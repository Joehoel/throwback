-- App table: review bookkeeping for the local (File System Access) curation path
-- (ADR-0019). The photo metadata itself lives in the file; only the review state
-- lives here, keyed by the photo's local (relative) path. Separate from
-- "photo_index" (the dormant OneDrive index, keyed by DriveItemId).
create table "local_review" (
  "path" text not null primary key,
  "review_status" text not null default 'needs_review'
);
