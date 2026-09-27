import { Option, Schema } from "effect";
import { GraphConnectionVersion } from "../curator/model.ts";
import { DriveItemId, LibraryId } from "./model.ts";

/** Durable identity shared by retries of one initial Graph delta traversal. */
export const IndexRunId = Schema.String.check(Schema.isUUID(4)).pipe(Schema.brand("IndexRunId"));

/** Durable identity shared by retries of one initial Graph delta traversal. */
export type IndexRunId = typeof IndexRunId.Type;

/** Cloudflare identity of the Workflow instance that owns one index run. */
export const IndexWorkflowInstanceId = Schema.NonEmptyString.pipe(
  Schema.brand("IndexWorkflowInstanceId"),
);

/** Cloudflare identity of the Workflow instance that owns one index run. */
export type IndexWorkflowInstanceId = typeof IndexWorkflowInstanceId.Type;

/** Monotone projection generation scoped to one Bibliotheek. */
export const IndexGeneration = Schema.Int.pipe(Schema.brand("IndexGeneration"));

/** Monotone projection generation scoped to one Bibliotheek. */
export type IndexGeneration = typeof IndexGeneration.Type;

/** Provider-issued continuation URL, persisted and replayed without interpretation. */
export const GraphDeltaLink = Schema.NonEmptyString.pipe(Schema.brand("GraphDeltaLink"));

/** Provider-issued continuation URL, persisted and replayed without interpretation. */
export type GraphDeltaLink = typeof GraphDeltaLink.Type;

/** Minimal whole-drive node classification needed for ancestry traversal. */
export const DriveNodeType = Schema.Literals(["folder", "file", "other"]);

/** Minimal whole-drive node classification needed for ancestry traversal. */
export type DriveNodeType = typeof DriveNodeType.Type;

/** Minimal whole-drive skeleton node; content and display metadata deliberately do not belong here. */
export const DriveNode = Schema.Struct({
  id: DriveItemId,
  parentId: Schema.Option(DriveItemId),
  nodeType: DriveNodeType,
  tombstone: Schema.Boolean,
});

/** Minimal whole-drive skeleton node; content and display metadata deliberately do not belong here. */
export type DriveNode = typeof DriveNode.Type;

export const NextDeltaContinuation = Schema.TaggedStruct("Next", { link: GraphDeltaLink });

export const CompleteDeltaContinuation = Schema.TaggedStruct("Complete", {
  link: GraphDeltaLink,
});

export const DeltaContinuation = Schema.Union([NextDeltaContinuation, CompleteDeltaContinuation]);

export type DeltaContinuation = typeof DeltaContinuation.Type;

/** One decoded Graph delta page and its opaque provider continuation. */
export const DriveDeltaPage = Schema.Struct({
  items: Schema.Array(DriveNode),
  continuation: DeltaContinuation,
});

/** One decoded Graph delta page and its opaque provider continuation. */
export type DriveDeltaPage = typeof DriveDeltaPage.Type;

export const LibraryIndexStatus = Schema.Literals([
  "queued",
  "running",
  "retrying",
  "waiting_for_reauthentication",
  "failed",
  "active",
]);

export type LibraryIndexStatus = typeof LibraryIndexStatus.Type;

/** Durable internal state of one singleton initial enumeration. */
export const LibraryIndexRun = Schema.Struct({
  libraryId: LibraryId,
  runId: IndexRunId,
  generation: IndexGeneration,
  status: LibraryIndexStatus,
  workflowInstanceId: Schema.Option(IndexWorkflowInstanceId),
  graphConnectionVersion: GraphConnectionVersion,
  nextLink: Schema.Option(GraphDeltaLink),
  deltaLink: Schema.Option(GraphDeltaLink),
  activeGeneration: Schema.Option(IndexGeneration),
  pagesProcessed: Schema.Int,
  processedItems: Schema.Int,
});

/** Durable internal state of one singleton initial enumeration. */
export type LibraryIndexRun = typeof LibraryIndexRun.Type;

/** Curator-safe progress exposed by setup without provider cursors or Workflow identities. */
export const LibraryIndexProgress = Schema.Struct({
  status: LibraryIndexStatus,
  pagesProcessed: Schema.Int,
  processedItems: Schema.Int,
  reviewBlocked: Schema.Boolean,
}).annotate({ identifier: "LibraryIndexProgress" });

/** Curator-safe progress exposed by setup without provider cursors or Workflow identities. */
export type LibraryIndexProgress = typeof LibraryIndexProgress.Type;

/** Convert durable run state to the deliberately smaller setup read model. */
export function indexProgress(run: LibraryIndexRun): LibraryIndexProgress {
  return LibraryIndexProgress.make({
    status: run.status,
    pagesProcessed: run.pagesProcessed,
    processedItems: run.processedItems,
    reviewBlocked: Option.isNone(run.activeGeneration),
  });
}
