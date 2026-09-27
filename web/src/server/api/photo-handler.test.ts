import { Effect, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import type { SignedInMicrosoftAccount } from "../curator/model.ts";
import { MicrosoftAccountId } from "../curator/model.ts";
import { DriveId, DriveItemId, LibraryId } from "../library/model.ts";
import { PhotoNotFound } from "../photo/errors.ts";
import type { PhotoLibraryService } from "../photo/photo-library.ts";
import type { PhotoResource } from "../photo/model.ts";
import {
  EventId,
  Photo,
  PhotoContentTag,
  PhotoEntityTag,
  PhotoId,
  ProjectionRevision,
} from "../photo/model.ts";
import { ReviewReady } from "./contract.ts";
import {
  createSignedInDomainHandler,
  domainRequestHeaders,
} from "./test-support/domain-handler.ts";

const activePhoto = Photo.make({
  libraryId: LibraryId.make("00000000-0000-4000-8000-000000000043"),
  eventId: EventId.make("event-a"),
  photoId: PhotoId.make("photo-a"),
  fileName: "familie.jpg",
  description: "Zondagmiddag",
  location: null,
  orientation: 6,
  cTag: PhotoContentTag.make("ctag-a"),
  eTag: PhotoEntityTag.make("etag-a"),
  projectionRevision: ProjectionRevision.make(1),
});

function bootstrapRequest(): Request {
  return new Request("https://example.test/api/domain/bootstrap", {
    headers: domainRequestHeaders(),
  });
}

function photoRequest(photoId = "photo-a"): Request {
  return new Request(
    `https://example.test/api/domain/libraries/${activePhoto.libraryId}/events/${activePhoto.eventId}/photos/${photoId}`,
    { headers: domainRequestHeaders() },
  );
}

function photoPreviewRequest(photoId = "photo-a"): Request {
  return new Request(
    `https://example.test/api/domain/libraries/${activePhoto.libraryId}/events/${activePhoto.eventId}/photos/${photoId}/preview`,
    { headers: domainRequestHeaders() },
  );
}

function photoLibrary(): PhotoLibraryService {
  const find = (_account: SignedInMicrosoftAccount, resource: PhotoResource) =>
    resource.photoId === activePhoto.photoId
      ? Effect.succeed(activePhoto)
      : Effect.fail(
          new PhotoNotFound({
            message:
              "Deze Foto staat niet in de actieve reviewqueue. Ga terug naar de Bibliotheek.",
          }),
        );

  return {
    getPhoto: find,
    previewPhoto: (account, resource) =>
      find(account, resource).pipe(
        Effect.as(Stream.make(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))),
      ),
  };
}

describe("Foto domain API", () => {
  it("returns canonical metadata only for the exact active bookmark", async () => {
    const handler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      photoLibrary: photoLibrary(),
    });

    const response = await handler(photoRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(activePhoto);
  });

  it("opens the first stable eligible Foto after atomic generation activation", async () => {
    const handler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      selectedLibrary: {
        id: activePhoto.libraryId,
        curatorProviderAccountId: MicrosoftAccountId.make("owner-oid"),
        driveId: DriveId.make("drive-a"),
        rootDriveItemId: DriveItemId.make("folder-a"),
        root: { name: "Familiefoto's", path: "OneDrive / Familiefoto's" },
      },
      firstPhoto: activePhoto,
      indexProgress: {
        status: "active",
        pagesProcessed: 3,
        processedItems: 43,
        reviewBlocked: false,
      },
    });

    const response = await handler(bootstrapRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      ReviewReady.make({
        libraryId: activePhoto.libraryId,
        eventId: activePhoto.eventId,
        photoId: activePhoto.photoId,
      }),
    );
  });

  it("streams an authenticated JPEG without running JSON validation", async () => {
    const handler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      photoLibrary: photoLibrary(),
    });

    const response = await handler(photoPreviewRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
    expect(JSON.stringify([...response.headers])).not.toMatch(/access.?token|refresh.?token/iu);
  });

  it("returns a real 404 for an unknown or non-reviewable Foto", async () => {
    const handler = createSignedInDomainHandler({
      accountId: "owner-oid",
      ownerId: "owner-oid",
      photoLibrary: photoLibrary(),
    });

    const response = await handler(photoRequest("unknown-photo"));

    expect(response.status).toBe(404);
    const error = Schema.decodeUnknownSync(PhotoNotFound)(await response.json());

    expect(error).toBeInstanceOf(PhotoNotFound);
    expect(error.message).toBe(
      "Deze Foto staat niet in de actieve reviewqueue. Ga terug naar de Bibliotheek.",
    );
  });
});
