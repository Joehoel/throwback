import { Effect, Layer } from "effect";
import { LibrarySetup } from "../../library/library-setup.ts";
import type { LibrarySetupService } from "../../library/library-setup.ts";
import { PhotoLibrary } from "../../photo/photo-library.ts";
import type { PhotoLibraryService } from "../../photo/photo-library.ts";
import { createDomainRequestHandler } from "../handler.ts";
import { BUILD_ID } from "../../config/build-id.ts";
import { BUILD_ID_HEADER } from "../build-compatibility.ts";
import { signedInAccessLayer, signedOutAccessLayer } from "./domain-access-layer.ts";
import type { DomainAccessOptions } from "./domain-access-layer.ts";

const unusedLibrarySetup = Layer.succeed(LibrarySetup, {
  browseFolders: () => Effect.die("Library setup is not configured for this test"),
  selectLibrary: () => Effect.die("Library setup is not configured for this test"),
});

const unusedPhotoLibrary = Layer.succeed(PhotoLibrary, {
  getPhoto: () => Effect.die("Foto reads are not configured for this test"),
  previewPhoto: () => Effect.die("Foto previews are not configured for this test"),
});

export const signedOutDomainHandler = createDomainRequestHandler(
  Layer.mergeAll(signedOutAccessLayer, unusedLibrarySetup, unusedPhotoLibrary),
);

/** Current-build headers required by JSON domain API operations in tests. */
export function domainRequestHeaders(): HeadersInit {
  return { [BUILD_ID_HEADER]: BUILD_ID };
}

/** Build the real domain HTTP handler over replaceable API-test authorities. */
export function createSignedInDomainHandler(
  options: DomainAccessOptions & {
    readonly librarySetup?: LibrarySetupService;
    readonly photoLibrary?: PhotoLibraryService;
  },
): (request: Request) => Promise<Response> {
  const librarySetupLayer =
    options.librarySetup === undefined
      ? unusedLibrarySetup
      : Layer.succeed(LibrarySetup, options.librarySetup);

  const photoLibraryLayer =
    options.photoLibrary === undefined
      ? unusedPhotoLibrary
      : Layer.succeed(PhotoLibrary, options.photoLibrary);

  return createDomainRequestHandler(
    Layer.mergeAll(signedInAccessLayer(options), librarySetupLayer, photoLibraryLayer),
  );
}
