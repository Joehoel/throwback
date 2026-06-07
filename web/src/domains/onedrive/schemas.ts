import { Schema } from "effect";
import { GraphDriveItem, LocationFromFacet } from "#/domains/shared/graph.ts";

/**
 * Wire envelopes for the Graph responses the OneDrive client reads. The item
 * shape itself is the domain `GraphDriveItem` (docs/design/domain-model.md §3);
 * these only wrap it in Graph's collection / single-item containers.
 */

/** One page of a `/children` collection. Graph paginates via `@odata.nextLink`. */
export const GraphChildrenPage = Schema.Struct({
  value: Schema.Array(GraphDriveItem),
  "@odata.nextLink": Schema.optionalKey(Schema.String),
});
export type GraphChildrenPage = typeof GraphChildrenPage.Type;

/**
 * A `$select=location` single-item response. `location` decodes through the
 * shared facet mapper (→ `Location | null`), absent key → undefined; the client
 * flattens both to `Location | null`.
 */
export const GraphLocationEnvelope = Schema.Struct({
  location: Schema.optionalKey(LocationFromFacet),
});
export type GraphLocationEnvelope = typeof GraphLocationEnvelope.Type;
