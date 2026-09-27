import { Effect, Layer, Option, Redacted, Stream } from "effect";
import { GraphAccessToken } from "../graph/graph-token.ts";
import { MicrosoftGraph } from "../graph/microsoft-graph.ts";
import { MicrosoftGraphApi } from "../graph/microsoft-graph-api.ts";
import { MicrosoftGraphPhotoApi } from "../graph/microsoft-graph-photo-api.ts";
import {
  CompleteDeltaContinuation,
  GraphDeltaLink,
  DriveNode,
} from "../library/library-index-model.ts";
import { DriveId, DriveItemId } from "../library/model.ts";

function node(id: string, nodeType: "file" | "folder", parentId?: string) {
  return DriveNode.make({
    id: DriveItemId.make(id),
    parentId: Option.fromNullishOr(parentId).pipe(Option.map((value) => DriveItemId.make(value))),
    nodeType,
    tombstone: false,
  });
}

/** Graph doubles behind production interfaces for one complete JPEG tracer. */
export function photoTracerGraphLayers(jpeg: Uint8Array) {
  return {
    token: Layer.succeed(GraphAccessToken, {
      get: () => Effect.succeed(Redacted.make("server-only-token")),
    }),
    selection: Layer.succeed(MicrosoftGraph, {
      browseFolders: () => Effect.die("unused"),
      resolveSelectableFolder: () =>
        Effect.succeed({
          driveId: DriveId.make("drive-a"),
          itemId: DriveItemId.make("selected-root"),
          root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
        }),
    }),
    delta: Layer.succeed(MicrosoftGraphApi, {
      getDefaultDrive: () => Effect.die("unused"),
      getFolder: () => Effect.die("unused"),
      listChildFolders: () => Effect.die("unused"),
      getDriveRootDeltaPage: () =>
        Effect.succeed({
          items: [
            node("selected-root", "folder"),
            node("event-a", "folder", "selected-root"),
            node("photo-a", "file", "event-a"),
            node("notes-a", "file", "event-a"),
            node("outside", "folder"),
            node("outside-photo", "file", "outside"),
          ],
          continuation: CompleteDeltaContinuation.make({
            link: GraphDeltaLink.make("https://graph.example.test/final-delta"),
          }),
        }),
    }),
    photo: Layer.succeed(MicrosoftGraphPhotoApi, {
      getFile: (token, _driveId, itemId) => {
        if (Redacted.value(token) !== "server-only-token") {
          return Effect.die("Foto details require the server-only Graph token");
        }

        return Effect.succeed({
          id: itemId,
          name: itemId === "photo-a" ? "familie.jpg" : "notes.txt",
          parentItemId: Option.some(DriveItemId.make("event-a")),
          mimeType: Option.some(itemId === "photo-a" ? "image/jpeg" : "text/plain"),
          cTag: Option.some("ctag-a"),
          eTag: Option.some("etag-a"),
          downloadUrl: Option.some(Redacted.make("https://content.example.test/private-jpeg")),
        });
      },
      download: () => Effect.succeed(Stream.make(jpeg)),
    }),
  } as const;
}
