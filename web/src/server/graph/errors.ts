import { Schema } from "effect";

/** A Graph item exists but is not a selectable local folder. */
export class GraphItemNotFolder extends Schema.TaggedError<GraphItemNotFolder>()(
  "GraphItemNotFolder",
  { message: Schema.String },
) {}
