-- App table: the optimistic write queue (ADR-0011/0009). The D1 index is the source
-- for pending writes; the server-side flusher reads from here. One job per photo
-- (keyed by photo_id, matching write.status({ photoId })). payload is JSON-encoded
-- WritePayload. See docs/design/domain-model.md §5.
create table "write_jobs" (
  "photo_id" text not null primary key,
  "payload" text not null,
  "status" text not null default 'pending',
  "attempts" integer not null default 0,
  "workflow_instance_id" text,
  "error" text
);
--> statement-breakpoint
create index "write_jobs_status_idx" on "write_jobs" ("status");
