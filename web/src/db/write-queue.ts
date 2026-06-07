import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { DriveItemId, WorkflowInstanceId } from "#/domains/shared/ids.ts";
import { WritePayload, WriteStatus } from "#/domains/shared/write.ts";
import type { WriteJob } from "#/domains/shared/write.ts";

/**
 * Write-queue persistence (ADR-0011/0009). The D1 index is the source for pending
 * writes; the server-side flusher reads from here. See docs/design/domain-model.md §5.
 */

/** D1 row <-> WriteJob codec. payload is JSON; `encodeKeys` for snake_case. */
export const WriteJobFromRow = Schema.Struct({
  photoId: DriveItemId,
  payload: Schema.fromJsonString(WritePayload),
  status: WriteStatus,
  attempts: Schema.Int,
  workflowInstanceId: Schema.NullOr(WorkflowInstanceId),
  error: Schema.NullOr(Schema.String),
}).pipe(Schema.encodeKeys({ photoId: "photo_id", workflowInstanceId: "workflow_instance_id" }));

/** Enqueue (or replace) the pending write for a photo. */
export const enqueue = (job: WriteJob) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const r = yield* Schema.encodeEffect(WriteJobFromRow)(job);
    yield* sql`
      INSERT INTO write_jobs (photo_id, payload, status, attempts, workflow_instance_id, error)
      VALUES (${r.photo_id}, ${r.payload}, ${r.status}, ${r.attempts}, ${r.workflow_instance_id}, ${r.error})
      ON CONFLICT(photo_id) DO UPDATE SET
        payload = excluded.payload, status = excluded.status, attempts = excluded.attempts,
        workflow_instance_id = excluded.workflow_instance_id, error = excluded.error
    `;
  });

/** All pending jobs — the flusher's work-list. */
export const pending = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`SELECT * FROM write_jobs WHERE status = 'pending' ORDER BY photo_id`;
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(WriteJobFromRow)(row));
});

/** Read one job's status row (drives the UI's write.status poll). */
export const get = (photoId: DriveItemId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql`SELECT * FROM write_jobs WHERE photo_id = ${photoId} LIMIT 1`;
    if (rows.length === 0) {
      return null;
    }
    return yield* Schema.decodeUnknownEffect(WriteJobFromRow)(rows[0]);
  });

/** Update status (+ optional workflow instance id / error) as the write progresses. */
export const setStatus = (
  photoId: DriveItemId,
  status: typeof WriteStatus.Type,
  opts?: { workflowInstanceId?: string | null; error?: string | null },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      UPDATE write_jobs
      SET status = ${status},
          workflow_instance_id = ${opts?.workflowInstanceId ?? null},
          error = ${opts?.error ?? null}
      WHERE photo_id = ${photoId}
    `;
  });
