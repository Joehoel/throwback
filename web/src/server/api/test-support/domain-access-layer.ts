import { Effect, Layer, Option } from "effect";
import { ApplicationSession } from "../../auth/application-session.ts";
import { CuratorAccessLive } from "../../curator/curator-access.ts";
import {
  BetterAuthAccountId,
  CuratorIdentity,
  GraphConnectionVersion,
  MicrosoftAccountId,
} from "../../curator/model.ts";
import { CuratorStore } from "../../curator/curator-store.ts";
import { LibraryStore } from "../../library/library-store.ts";
import type { LibraryIndexProgress } from "../../library/library-index-model.ts";
import type { LibraryBoundary } from "../../library/model.ts";
import type { Photo } from "../../photo/model.ts";
import { domainProjectionLayers } from "./domain-projection-layers.ts";

/** Mutable in-memory authorities used by the domain API test harness. */
export interface DomainAccessOptions {
  readonly accountId: string;
  readonly ownerId?: string;
  readonly hasGraphConnection?: boolean;
  readonly selectedLibrary?: LibraryBoundary;
  readonly firstPhoto?: Photo;
  readonly indexProgress?: LibraryIndexProgress;
}

export const signedOutAccessLayer = CuratorAccessLive.pipe(
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
      domainProjectionLayers({}),
    ),
  ),
);

/** Build signed-in Curator policy over mutable in-memory test authorities. */
export function signedInAccessLayer(options: DomainAccessOptions) {
  let owner = Option.fromNullishOr(options.ownerId).pipe(
    Option.map((ownerId) =>
      CuratorIdentity.make({
        providerId: "microsoft",
        providerAccountId: MicrosoftAccountId.make(ownerId),
      }),
    ),
  );

  let selectedLibrary = Option.fromNullishOr(options.selectedLibrary);

  return CuratorAccessLive.pipe(
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
                graphConnectionVersion: GraphConnectionVersion.make("connection-v1"),
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
        domainProjectionLayers(options),
      ),
    ),
  );
}
