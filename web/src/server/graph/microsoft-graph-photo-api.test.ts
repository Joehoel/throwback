import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Effect, Layer, Option, Redacted, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect, it } from "vitest";
import { DriveId, DriveItemId } from "../library/model.ts";
import { MicrosoftGraphPhotoApi, MicrosoftGraphPhotoApiLive } from "./microsoft-graph-photo-api.ts";

const jpegPath = fileURLToPath(new URL("../jpeg/fixtures/baseline-minimal.jpg", import.meta.url));

function graphPhotoLayer(fetchImplementation: typeof fetch) {
  const httpLayer = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
  );

  return MicrosoftGraphPhotoApiLive.pipe(Layer.provide(httpLayer));
}

describe("Microsoft Graph Foto boundary", () => {
  it("keeps OAuth on Graph metadata and never forwards it to the preauthenticated JPEG URL", async () => {
    const requests: Request[] = [];
    const jpeg = new Uint8Array(await readFile(jpegPath));

    const fetchImplementation: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);

      if (new URL(request.url).hostname === "graph.microsoft.com") {
        return Promise.resolve(
          Response.json({
            id: "photo-a",
            name: "familie.jpg",
            parentReference: { id: "event-a" },
            file: { mimeType: "image/jpeg" },
            cTag: "ctag-a",
            eTag: "etag-a",
            "@microsoft.graph.downloadUrl": "https://content.example.test/private-jpeg",
          }),
        );
      }

      return Promise.resolve(new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
    };

    const result = await Effect.runPromise(
      MicrosoftGraphPhotoApi.pipe(
        Effect.flatMap((graph) =>
          Effect.gen(function* () {
            const file = yield* graph.getFile(
              Redacted.make("server-only-token"),
              DriveId.make("drive-a"),
              DriveItemId.make("photo-a"),
            );

            const content = yield* graph.download(Option.getOrThrow(file.downloadUrl));
            const chunks = yield* Stream.runCollect(content);

            return { chunks, file };
          }),
        ),
        Effect.provide(graphPhotoLayer(fetchImplementation)),
      ),
    );

    expect(result.file).toMatchObject({
      id: "photo-a",
      name: "familie.jpg",
      parentItemId: Option.some("event-a"),
      mimeType: Option.some("image/jpeg"),
      cTag: Option.some("ctag-a"),
      eTag: Option.some("etag-a"),
    });
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer server-only-token");
    expect(requests[1]?.headers.has("authorization")).toBe(false);
    expect([...result.chunks].reduce((length, chunk) => length + chunk.length, 0)).toBe(
      jpeg.length,
    );
  });
});
