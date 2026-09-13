import { Effect, Layer, Option, Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect, it } from "vitest";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  MicrosoftAccountId,
} from "../curator/model.ts";
import { InvalidLibrarySelection, OneDriveUnavailable } from "../library/errors.ts";
import { DriveItemId } from "../library/model.ts";
import { GraphAccessToken } from "./graph-token.ts";
import { MicrosoftGraphApiLive } from "./microsoft-graph-api.ts";
import { MicrosoftGraph, MicrosoftGraphLive } from "./microsoft-graph.ts";

const account = {
  userId: BetterAuthUserId.make("user-a"),
  betterAuthAccountId: BetterAuthAccountId.make("account-a"),
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
