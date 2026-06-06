-- App table: the photo index (ADR-0009). Filled by the children-crawl, queried per
-- session. "Missing" is NULL-ness (no boolean flags) — see docs/design/domain-model.md §4.
-- camelCase-free snake_case columns; the @effect/sql-d1 PhotoFromRow codec maps them.
create table "photo_index" (
  "id" text not null primary key,
  "folder_id" text not null,
  "name" text not null,
  "year" integer,
  "mime_type" text not null,
  "description" text,
  "location" text,
  "review_status" text not null default 'needs_review'
);
--> statement-breakpoint
create index "photo_index_review_status_idx" on "photo_index" ("review_status");
--> statement-breakpoint
create index "photo_index_folder_id_idx" on "photo_index" ("folder_id");
