import { Effect, Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";
import { BUILD_ID } from "../config/build-id.ts";
import { MicrosoftAccountId } from "../curator/model.ts";
import { DriveId, DriveItemId, LibraryId } from "../library/model.ts";
import { BUILD_ID_HEADER } from "./build-compatibility.ts";
import {
  BuildUpgradeRequired,
  CuratorClaimRequired,
  LibraryIndexing,
  LibrarySelectionRequired,
  SignInRequired,
  ThrowbackApi,
} from "./contract.ts";
import {
  createSignedInDomainHandler,
  signedOutDomainHandler,
} from "./test-support/domain-handler.ts";

function claimRequest(): Request {
  return new Request("https://example.test/api/domain/curator/claim", {
    body: JSON.stringify({ confirmed: true }),
    headers: {
      "content-type": "application/json",
      [BUILD_ID_HEADER]: BUILD_ID,
    },
    method: "POST",
  });
}

function bootstrapRequest(): Request {
  return new Request("https://example.test/api/domain/bootstrap", {
    headers: { [BUILD_ID_HEADER]: BUILD_ID },
  });
}

function listFoldersRequest(): Request {
  return new Request("https://example.test/api/domain/library/folders", {
    headers: { [BUILD_ID_HEADER]: BUILD_ID },
  });
}

function selectLibraryRequest(rootFolderId: string): Request {
  return new Request("https://example.test/api/domain/library/selection", {
    body: JSON.stringify({ rootFolderId, confirmed: true }),
    headers: {
      "content-type": "application/json",
      [BUILD_ID_HEADER]: BUILD_ID,
    },
    method: "POST",
  });
}

describe("Throwback domain API", () => {
  it("returns the server-confirmed bootstrap state", async () => {
    const response = await signedOutDomainHandler(
      new Request("https://example.test/api/domain/bootstrap", {
        headers: { [BUILD_ID_HEADER]: BUILD_ID },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(SignInRequired.make({ reason: "signedOut" }));
  });

  it("rejects an incompatible SPA build with a declared error", async () => {
    const response = await signedOutDomainHandler(
      new Request("https://example.test/api/domain/bootstrap", {
        headers: { [BUILD_ID_HEADER]: "stale-build" },
      }),
    );

    expect(response.status).toBe(409);
    const error = Schema.decodeUnknownSync(BuildUpgradeRequired)(await response.json());

    expect(error).toBeInstanceOf(BuildUpgradeRequired);
    expect(error.currentBuildId).toBe(BUILD_ID);
    expect(error.message).toBe(
      "Deze versie van de Beheer-webapp is verouderd. Laad de pagina opnieuw.",
    );
  });

  it("requires a Better Auth session before a Curator claim", async () => {
    const response = await signedOutDomainHandler(claimRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toHaveProperty("_tag", "AuthenticationRequired");
  });

  it("atomically claims for the signed-in Microsoft identity", async () => {
    const signedInHandler = createSignedInDomainHandler({ accountId: "owner-oid" });
    const response = await signedInHandler(claimRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(LibrarySelectionRequired.make({}));
  });

  it("shows the Microsoft account before the explicit claim", async () => {
    const signedInHandler = createSignedInDomainHandler({ accountId: "candidate-oid" });
    const response = await signedInHandler(bootstrapRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      CuratorClaimRequired.make({
        account: {
          provider: "microsoft",
          name: "Curator",
          email: "curator@example.test",
        },
      }),
    );
  });

  it("routes an owner-mismatched session back to sign-in", async () => {
    const signedInHandler = createSignedInDomainHandler({
      accountId: "other-oid",
      ownerId: "owner-oid",
    });

    const response = await signedInHandler(bootstrapRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      SignInRequired.make({ reason: "ownerMismatch" }),
    );
  });

  it("rejects a stale session when another Microsoft identity won the claim", async () => {
    const signedInHandler = createSignedInDomainHandler({
      accountId: "other-oid",
      ownerId: "owner-oid",
    });

    const response = await signedInHandler(claimRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toHaveProperty("_tag", "CuratorOwnershipConflict");
  });

  it("requires the claimed Curator before browsing OneDrive folders", async () => {
    const signedInHandler = createSignedInDomainHandler({ accountId: "candidate-oid" });
    const response = await signedInHandler(listFoldersRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toHaveProperty("_tag", "CuratorOwnershipConflict");
  });

  it("returns only the folder view from the server-side Graph boundary", async () => {
    const signedInHandler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      librarySetup: {
        browseFolders: () =>
          Effect.succeed({
            current: {
              id: DriveItemId.make("root"),
              name: "OneDrive",
              path: "OneDrive",
              isDriveRoot: true,
            },
            folders: [{ id: DriveItemId.make("folder-a"), name: "Familie", childCount: 12 }],
          }),
        selectLibrary: () => Effect.die("Selection is not configured for this test"),
      },
    });

    const response = await signedInHandler(listFoldersRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      current: { id: "root", name: "OneDrive", path: "OneDrive", isDriveRoot: true },
      folders: [{ id: "folder-a", name: "Familie", childCount: 12 }],
    });
    expect(JSON.stringify(body)).not.toMatch(/access.?token|refresh.?token/iu);
  });

  it("confirms one Hoofdmap and returns its visible indexing boundary", async () => {
    const selectedLibrary = {
      id: LibraryId.make("00000000-0000-4000-8000-000000000043"),
      curatorProviderAccountId: MicrosoftAccountId.make("owner-oid"),
      driveId: DriveId.make("drive-a"),
      rootDriveItemId: DriveItemId.make("folder-a"),
      root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
    };

    const signedInHandler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      librarySetup: {
        browseFolders: () => Effect.die("Browsing is not configured for this test"),
        selectLibrary: () => Effect.succeed(selectedLibrary),
      },
    });

    const response = await signedInHandler(selectLibraryRequest("folder-a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      LibraryIndexing.make({
        libraryId: LibraryId.make("00000000-0000-4000-8000-000000000043"),
        rootFolder: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
        discoveredPhotos: 0,
      }),
    );
  });

  it("shows the persisted Hoofdmap in authoritative bootstrap state", async () => {
    const signedInHandler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      selectedLibrary: {
        id: LibraryId.make("00000000-0000-4000-8000-000000000043"),
        curatorProviderAccountId: MicrosoftAccountId.make("owner-oid"),
        driveId: DriveId.make("drive-a"),
        rootDriveItemId: DriveItemId.make("folder-a"),
        root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
      },
    });

    const response = await signedInHandler(bootstrapRequest());

    await expect(response.json()).resolves.toEqual(
      LibraryIndexing.make({
        libraryId: LibraryId.make("00000000-0000-4000-8000-000000000043"),
        rootFolder: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
        discoveredPhotos: 0,
      }),
    );
  });

  it("publishes an OpenAPI 3.1 bootstrap contract", () => {
    const specification = OpenApi.fromApi(ThrowbackApi);

    expect(specification.openapi).toBe("3.1.0");
    expect(specification.paths["/bootstrap"]?.get?.responses["409"]?.description).toBe(
      "BuildUpgradeRequired",
    );
    expect(specification.paths["/curator/claim"]?.post?.responses["401"]?.description).toBe(
      "AuthenticationRequired",
    );
    expect(specification.paths["/library/folders"]?.get?.responses["401"]?.description).toContain(
      "GraphReauthenticationRequired",
    );
    expect(JSON.stringify(specification)).not.toMatch(/access.?token|refresh.?token/iu);
  });
});
