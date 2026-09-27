import { Effect, Layer, Option, Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect, it } from "vitest";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  GraphConnectionVersion,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { InvalidLibrarySelection, OneDriveUnavailable } from "../library/errors.ts";
import { DriveId, DriveItemId } from "../library/model.ts";
import { GraphAccessToken } from "./graph-token.ts";
import { MicrosoftGraphApi, MicrosoftGraphApiLive } from "./microsoft-graph-api.ts";
import { MicrosoftGraph, MicrosoftGraphLive } from "./microsoft-graph.ts";

const account = {
  userId: BetterAuthUserId.make("user-a"),
  betterAuthAccountId: BetterAuthAccountId.make("account-a"),
  graphConnectionVersion: GraphConnectionVersion.make("connection-v1"),
  identity: CuratorIdentity.make({
    providerId: "microsoft",
    providerAccountId: MicrosoftAccountId.make("owner-oid"),
  }),
  display: { provider: "microsoft" as const, name: "Curator", email: "curator@example.test" },
  hasGraphConnection: true,
};

function graphLayer(fetchImplementation: typeof fetch) {
  const httpLayer = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
  );

  return MicrosoftGraphLive.pipe(
    Layer.provide([
      Layer.succeed(GraphAccessToken, {
        get: () => Effect.succeed(Redacted.make("synthetic-access-token")),
      }),
      MicrosoftGraphApiLive.pipe(Layer.provide(httpLayer)),
    ]),
  );
}

describe("Microsoft Graph folder boundary", () => {
  it("follows pagination and returns only local folders", async () => {
    const requests: Request[] = [];

    const fetchImplementation: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requests.push(request);

      if (url.pathname.endsWith("/me/drive")) {
        return Promise.resolve(Response.json({ id: "drive-a" }));
      }

      if (url.pathname.endsWith("/drives/drive-a/root")) {
        return Promise.resolve(
          Response.json({ id: "root", name: "OneDrive", folder: { childCount: 3 } }),
        );
      }

      if (url.searchParams.get("page") === "2") {
        return Promise.resolve(
          Response.json({ value: [{ id: "folder-b", name: "B", folder: { childCount: 1 } }] }),
        );
      }

      return Promise.resolve(
        Response.json({
          value: [
            { id: "folder-a", name: "A", folder: { childCount: 2 } },
            { id: "photo", name: "photo.jpg", file: {} },
            { id: "shared", name: "Shared", folder: { childCount: 2 }, remoteItem: {} },
          ],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/drives/drive-a/items/root/children?page=2",
        }),
      );
    };

    const listing = await Effect.runPromise(
      MicrosoftGraph.pipe(
        Effect.flatMap((graph) => graph.browseFolders(account, Option.none())),
        Effect.provide(graphLayer(fetchImplementation)),
      ),
    );

    expect(listing.folders).toEqual([
      { id: "folder-a", name: "A", childCount: 2 },
      { id: "folder-b", name: "B", childCount: 1 },
    ]);
    expect(listing.current).toMatchObject({ id: "root", path: "OneDrive", isDriveRoot: true });
    expect(requests).toHaveLength(4);
    expect(
      requests.every(
        (request) => request.headers.get("authorization") === "Bearer synthetic-access-token",
      ),
    ).toBe(true);
  });

  it("rejects a provider next link outside the current drive folder", async () => {
    const fetchImplementation: typeof fetch = (input, init) => {
      const url = new URL(new Request(input, init).url);

      if (url.pathname.endsWith("/me/drive")) {
        return Promise.resolve(Response.json({ id: "drive-a" }));
      }

      if (url.pathname.endsWith("/drives/drive-a/root")) {
        return Promise.resolve(
          Response.json({ id: "root", name: "OneDrive", folder: { childCount: 1 } }),
        );
      }

      return Promise.resolve(
        Response.json({
          value: [],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/drives/drive-b/items/root/children?page=2",
        }),
      );
    };

    const error = await Effect.runPromise(
      MicrosoftGraph.pipe(
        Effect.flatMap((graph) => graph.browseFolders(account, Option.none())),
        Effect.provide(graphLayer(fetchImplementation)),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(OneDriveUnavailable);
  });

  it("resolves a selectable folder in the server-bound current drive", async () => {
    const fetchImplementation: typeof fetch = (input, init) => {
      const url = new URL(new Request(input, init).url);

      return Promise.resolve(
        Response.json(
          url.pathname.endsWith("/me/drive")
            ? { id: "drive-a" }
            : url.pathname.endsWith("/root")
              ? { id: "root", name: "OneDrive", folder: { childCount: 1 } }
              : {
                  id: "folder-a",
                  name: "Familiefoto's",
                  folder: { childCount: 20 },
                  parentReference: { id: "root", path: "/drive/root:" },
                },
        ),
      );
    };

    const folder = await Effect.runPromise(
      MicrosoftGraph.pipe(
        Effect.flatMap((graph) =>
          graph.resolveSelectableFolder(account, DriveItemId.make("folder-a")),
        ),
        Effect.provide(graphLayer(fetchImplementation)),
      ),
    );

    expect(folder).toEqual({
      driveId: "drive-a",
      itemId: "folder-a",
      root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
    });
  });

  it("rejects the default OneDrive root as a Hoofdmap", async () => {
    const fetchImplementation: typeof fetch = (input, init) => {
      const url = new URL(new Request(input, init).url);

      return Promise.resolve(
        Response.json(
          url.pathname.endsWith("/me/drive")
            ? { id: "drive-a" }
            : url.pathname.endsWith("/root")
              ? { id: "root", name: "OneDrive", folder: { childCount: 20 } }
              : {
                  id: "root",
                  name: "OneDrive",
                  folder: { childCount: 20 },
                  parentReference: { id: "synthetic-parent", path: "/drive/root:" },
                },
        ),
      );
    };

    const error = await Effect.runPromise(
      MicrosoftGraph.pipe(
        Effect.flatMap((graph) => graph.resolveSelectableFolder(account, DriveItemId.make("root"))),
        Effect.provide(graphLayer(fetchImplementation)),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(InvalidLibrarySelection);
  });
});

describe("Microsoft Graph drive-root delta boundary", () => {
  it("uses the documented root request and follows provider links without interpreting them", async () => {
    const requests: Request[] = [];

    const opaqueNextLink =
      "https://graph.microsoft.com/v1.0/drives/drive-a/root/delta?%24skiptoken=a%2Fb%3D%3D&custom=unchanged";

    const fetchImplementation: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);

      return Promise.resolve(
        Response.json(
          requests.length === 1
            ? {
                value: [
                  { id: "root", folder: {} },
                  { id: "photo-a", parentReference: { id: "root" }, file: {} },
                ],
                "@odata.nextLink": opaqueNextLink,
              }
            : {
                value: [
                  { id: "photo-a", parentReference: { id: "selected-root" }, file: {} },
                  { id: "gone", deleted: { state: "deleted" } },
                ],
                "@odata.deltaLink":
                  "https://graph.microsoft.com/v1.0/drives/drive-a/root/delta?$deltatoken=opaque-final",
              },
        ),
      );
    };

    const httpLayer = FetchHttpClient.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
    );

    const apiLayer = MicrosoftGraphApiLive.pipe(Layer.provide(httpLayer));

    const pages = await Effect.runPromise(
      MicrosoftGraphApi.pipe(
        Effect.flatMap((api) =>
          Effect.gen(function* () {
            const first = yield* api.getDriveRootDeltaPage(
              Redacted.make("synthetic-access-token"),
              DriveId.make("drive-a"),
              Option.none(),
            );

            const second = yield* api.getDriveRootDeltaPage(
              Redacted.make("synthetic-access-token"),
              DriveId.make("drive-a"),
              Option.some(first.continuation.link),
            );

            return [first, second] as const;
          }),
        ),
        Effect.provide(apiLayer),
      ),
    );

    const firstUrl = new URL(requests[0]?.url ?? "");
    expect(firstUrl.pathname).toBe("/v1.0/drives/drive-a/root/delta");
    expect(firstUrl.searchParams.get("$select")).toBe("id,parentReference,folder,file,deleted");
    expect(requests[1]?.url).toBe(opaqueNextLink);
    expect(pages[0].continuation._tag).toBe("Next");
    expect(pages[1].continuation._tag).toBe("Complete");
    expect(pages[1].items).toEqual([
      {
        id: "photo-a",
        parentId: Option.some("selected-root"),
        nodeType: "file",
        tombstone: false,
      },
      {
        id: "gone",
        parentId: Option.none(),
        nodeType: "other",
        tombstone: true,
      },
    ]);
    expect(
      requests.every(
        (request) => request.headers.get("authorization") === "Bearer synthetic-access-token",
      ),
    ).toBe(true);
  });
});
