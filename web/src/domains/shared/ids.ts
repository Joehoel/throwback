import { Schema } from "effect";

/**
 * Branded identifiers (ADR-0013 rule: anything that resembles an id is branded,
 * so the distinct id-spaces never cross). See docs/design/domain-model.md §1.
 */

/** OneDrive driveItem id — the stable key for both a Photo and an Event folder. */
export const DriveItemId = Schema.String.pipe(Schema.brand("DriveItemId"));
export type DriveItemId = typeof DriveItemId.Type;

/** better-auth user id — the non-secret param the Workflow receives (ADR-0011). */
export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

/** Cloudflare Workflow instance id — for instance.status() polling (ADR-0011). */
export const WorkflowInstanceId = Schema.String.pipe(Schema.brand("WorkflowInstanceId"));
export type WorkflowInstanceId = typeof WorkflowInstanceId.Type;
