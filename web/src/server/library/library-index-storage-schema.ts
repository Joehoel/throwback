import { Schema, SchemaTransformation } from "effect";
import { GraphConnectionVersion } from "../curator/model.ts";
import {
  GraphDeltaLink,
  IndexGeneration,
  IndexRunId,
  IndexWorkflowInstanceId,
  LibraryIndexStatus,
} from "./library-index-model.ts";
import { DriveItemId, LibraryId } from "./model.ts";

export const StoredLibraryIndexRun = Schema.Struct({
  libraryId: LibraryId,
  runId: IndexRunId,
  generation: IndexGeneration,
  status: LibraryIndexStatus,
  workflowInstanceId: Schema.OptionFromNullOr(IndexWorkflowInstanceId),
  graphConnectionVersion: GraphConnectionVersion,
  nextLink: Schema.OptionFromNullOr(GraphDeltaLink),
  pendingDeltaLink: Schema.OptionFromNullOr(GraphDeltaLink),
  deltaLink: Schema.OptionFromNullOr(GraphDeltaLink),
  activeGeneration: Schema.OptionFromNullOr(IndexGeneration),
  pagesProcessed: Schema.Int,
  processedItems: Schema.Int,
});

export const ContainsActiveItemRequest = Schema.Struct({
  libraryId: LibraryId,
  itemId: DriveItemId,
});

export const StoredContainsActiveItem = Schema.Struct({
  containsItem: Schema.Literals([0, 1]),
}).pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: ({ containsItem }) => containsItem === 1,
      encode: (containsItem) => ({ containsItem: containsItem ? 1 : 0 }),
    }),
  ),
);
