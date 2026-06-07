import { Schema } from "effect";
import { DriveItemId, WorkflowInstanceId } from "./ids.ts";
import { Description, Location } from "./photo.ts";

/**
 * Write queue & workflow status. See docs/design/domain-model.md §5, ADR-0011/0009.
 * The D1 index is also the source for the optimistic mutation queue's pending writes.
 */

/** EXIF Orientation flag (1–8) — the literal value piexifjs writes; 1 = upright (ADR-0008). */
export const Orientation = Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8]);
export type Orientation = typeof Orientation.Type;

export const WriteKind = Schema.Literals(["description", "location_orientation"]);
export type WriteKind = typeof WriteKind.Type;

export const WriteStatus = Schema.Literals(["pending", "running", "succeeded", "failed"]);
export type WriteStatus = typeof WriteStatus.Type;

/**
 * The approved payload — discriminated union on a single-value `kind` Literal.
 * The location_orientation re-upload can carry location, orientation, or both
 * (at least one — a Schema.check for that is a remaining refinement).
 */
export const WritePayload = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("description"), text: Description }),
  Schema.Struct({
    kind: Schema.Literal("location_orientation"),
    location: Schema.optionalKey(Location),
    orientation: Schema.optionalKey(Orientation),
  }),
]);
export type WritePayload = typeof WritePayload.Type;

export const WriteJob = Schema.Struct({
  photoId: DriveItemId,
  payload: WritePayload,
  status: WriteStatus,
  attempts: Schema.Int,
  workflowInstanceId: Schema.NullOr(WorkflowInstanceId), // null until a location_orientation workflow starts
  error: Schema.NullOr(Schema.String), // null unless the last attempt failed
});
export type WriteJob = typeof WriteJob.Type;
