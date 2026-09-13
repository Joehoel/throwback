import { Effect, Layer, Option } from "effect";
import { ApplicationSession } from "../../auth/application-session.ts";
import { CuratorAccessLive } from "../../curator/curator-access.ts";
import { CuratorIdentity, MicrosoftAccountId } from "../../curator/model.ts";
import { CuratorStore } from "../../curator/curator-store.ts";
import { createDomainRequestHandler } from "../handler.ts";

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
    ),
  ),
);

export const signedOutDomainHandler = createDomainRequestHandler(signedOutAccessLayer);

export function createSignedInDomainHandler(options: {
  readonly accountId: string;
  readonly ownerId?: string;
  readonly hasGraphConnection?: boolean;
}): (request: Request) => Promise<Response> {
  let owner = Option.fromNullishOr(options.ownerId).pipe(
    Option.map((ownerId) =>
      CuratorIdentity.make({
        providerId: "microsoft",
        providerAccountId: MicrosoftAccountId.make(ownerId),
      }),
    ),
  );

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
                hasGraphConnection: options.hasGraphConnection ?? true,
              }),
            ),
          getOwner: Effect.sync(() => owner),
        }),
      ),
    ),
  );

  return createDomainRequestHandler(accessLayer);
}
