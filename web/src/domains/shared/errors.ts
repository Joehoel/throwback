import { Schema } from "effect";
import { DriveItemId, UserId } from "./ids.ts";

/**
 * Tagged-error taxonomy (ADR-0012/0013). `Schema.TaggedError` yields a real
 * Error, a Schema (serializable over oRPC), and a `_tag` for `Effect.catchTag`.
 * See docs/design/domain-model.md §7.
 */

export class GraphRequestError extends Schema.TaggedError<GraphRequestError>()(
  "GraphRequestError",
  {
    status: Schema.Number,
    retryAfter: Schema.optionalKey(Schema.Number), // 429/Retry-After (ADR-0011)
  },
) {}

export class TokenUnavailable extends Schema.TaggedError<TokenUnavailable>()("TokenUnavailable", {
  userId: UserId,
}) {}

export class UnsupportedFormat extends Schema.TaggedError<UnsupportedFormat>()(
  "UnsupportedFormat",
  {
    photoId: DriveItemId,
    mimeType: Schema.String, // location/orientation is JPEG only
  },
) {}

export class LocationVerifyTimeout extends Schema.TaggedError<LocationVerifyTimeout>()(
  "LocationVerifyTimeout",
  {
    photoId: DriveItemId, // Graph extracts the facet async ~6–9s (ADR-0011)
  },
) {}

export class IndexNotReady extends Schema.TaggedError<IndexNotReady>()("IndexNotReady", {}) {}
