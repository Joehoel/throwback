import { Effect, Layer, Option } from "effect";
import { ApplicationSession } from "../../auth/application-session.ts";
import { CuratorAccessLive } from "../../curator/curator-access.ts";
import { BetterAuthAccountId, CuratorIdentity, MicrosoftAccountId } from "../../curator/model.ts";
import { CuratorStore } from "../../curator/curator-store.ts";
import { LibrarySetup } from "../../library/library-setup.ts";
import type { LibrarySetupService } from "../../library/library-setup.ts";
import { LibraryStore } from "../../library/library-store.ts";
import type { LibraryBoundary } from "../../library/model.ts";
import { createDomainRequestHandler } from "../handler.ts";

const unusedLibrarySetup = Layer.succeed(LibrarySetup, {
  browseFolders: () => Effect.die("Library setup is not configured for this test"),
  selectLibrary: () => Effect.die("Library setup is not configured for this test"),
});

const signedOutAccessLayer = CuratorAccessLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(ApplicationSession, {
        get: () => Effect.succeed(Option.none()),
      }),
      Layer.succeed(CuratorStore, {
        claim: (identity) => Effect.succeed(identity),
        findMicrosoftAccount: () => Effect.succeed(Option.none()),
        getOwner: Effect.succeed(Option.none()),
      }),
      Layer.succeed(LibraryStore, {
        getSelected: () => Effect.succeed(Option.none()),
        select: (selection) => Effect.succeed(selection),
      }),
    ),
  ),
);

export const signedOutDomainHandler = createDomainRequestHandler(
  Layer.mergeAll(signedOutAccessLayer, unusedLibrarySetup),
);

export function createSignedInDomainHandler(options: {
  readonly accountId: string;
  readonly ownerId?: string;
  readonly hasGraphConnection?: boolean;
  readonly selectedLibrary?: LibraryBoundary;
  readonly librarySetup?: LibrarySetupService;
}): (request: Request) => Promise<Response> {
  let owner = Option.fromNullishOr(options.ownerId).pipe(
    Option.map((ownerId) =>
      CuratorIdentity.make({
        providerId: "microsoft",
        providerAccountId: MicrosoftAccountId.make(ownerId),
      }),
    ),
  );

  let selectedLibrary = Option.fromNullishOr(options.selectedLibrary);

  const accessLayer = CuratorAccessLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ApplicationSession, {
          get: () =>
            Effect.succeed(
              Option.some({
                user: { id: "user-a", name: "Curator", email: "curator@example.test" },
              }),
            ),
        }),
        Layer.succeed(CuratorStore, {
          claim: (identity) => {
            if (Option.isNone(owner)) {
              owner = Option.some(identity);
            }

            return Effect.succeed(Option.getOrThrow(owner));
          },
          findMicrosoftAccount: () =>
            Effect.succeed(
              Option.some({
                providerAccountId: MicrosoftAccountId.make(options.accountId),
                betterAuthAccountId: BetterAuthAccountId.make("account-user-a"),
                hasGraphConnection: options.hasGraphConnection ?? true,
              }),
            ),
          getOwner: Effect.sync(() => owner),
        }),
        Layer.succeed(LibraryStore, {
          getSelected: () => Effect.sync(() => selectedLibrary),
          select: (selection) =>
            Effect.sync(() => {
              if (Option.isNone(selectedLibrary)) {
                selectedLibrary = Option.some(selection);
              }

              return Option.getOrThrow(selectedLibrary);
            }),
        }),
      ),
    ),
  );

  const librarySetupLayer =
    options.librarySetup === undefined
      ? unusedLibrarySetup
      : Layer.succeed(LibrarySetup, options.librarySetup);

  return createDomainRequestHandler(Layer.mergeAll(accessLayer, librarySetupLayer));
}
