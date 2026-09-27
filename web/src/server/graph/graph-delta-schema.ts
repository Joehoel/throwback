import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect";
import {
  CompleteDeltaContinuation,
  DriveDeltaPage,
  DriveNode,
  GraphDeltaLink,
  NextDeltaContinuation,
} from "../library/library-index-model.ts";
import { DriveItemId } from "../library/model.ts";

const GraphDeltaItemResponse = Schema.Struct({
  id: DriveItemId,
  parentReference: Schema.OptionFromOptionalKey(
    Schema.Struct({ id: Schema.OptionFromOptionalKey(DriveItemId) }),
  ),
  folder: Schema.OptionFromOptionalKey(Schema.Unknown),
  file: Schema.OptionFromOptionalKey(Schema.Unknown),
  deleted: Schema.OptionFromOptionalKey(Schema.Unknown),
});

const GraphDeltaPage = Schema.Struct({
  value: Schema.Array(GraphDeltaItemResponse),
  "@odata.nextLink": Schema.OptionFromOptionalKey(GraphDeltaLink),
  "@odata.deltaLink": Schema.OptionFromOptionalKey(GraphDeltaLink),
});

function nodeType(item: typeof GraphDeltaItemResponse.Type): (typeof DriveNode.Type)["nodeType"] {
  if (Option.isSome(item.folder)) {
    return "folder";
  }

  if (Option.isSome(item.file)) {
    return "file";
  }

  return "other";
}

/** Decode a Graph delta response while preserving provider continuation links verbatim. */
export const GraphDeltaPageResponse = GraphDeltaPage.pipe(
  Schema.decodeTo(
    Schema.toType(DriveDeltaPage),
    SchemaTransformation.transformEffect({
      decode: (page) => {
        const nextLink = page["@odata.nextLink"];
        const deltaLink = page["@odata.deltaLink"];

        const items = page.value.map((item) =>
          DriveNode.make({
            id: item.id,
            parentId: Option.flatMap(item.parentReference, (parent) => parent.id),
            nodeType: nodeType(item),
            tombstone: Option.isSome(item.deleted),
          }),
        );

        if (Option.isSome(nextLink) && Option.isNone(deltaLink)) {
          return Effect.succeed(
            DriveDeltaPage.make({
              items,
              continuation: NextDeltaContinuation.make({ link: nextLink.value }),
            }),
          );
        }

        if (Option.isNone(nextLink) && Option.isSome(deltaLink)) {
          return Effect.succeed(
            DriveDeltaPage.make({
              items,
              continuation: CompleteDeltaContinuation.make({ link: deltaLink.value }),
            }),
          );
        }

        return Effect.fail(
          new SchemaIssue.InvalidValue(
            { message: "Graph delta page must contain exactly one continuation link" },
            page,
          ),
        );
      },
      encode: (page) =>
        Effect.fail(
          new SchemaIssue.Forbidden(
            { message: "Microsoft Graph delta schemas are decode-only" },
            page,
          ),
        ),
    }),
  ),
);
