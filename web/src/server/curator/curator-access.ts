import { Context, Effect, Layer, Option } from "effect";
import { ApplicationSession } from "../auth/application-session.ts";
import {
  CuratorClaimRequired,
  GraphConnectionRequired,
  LibraryIndexing,
  LibrarySelectionRequired,
  ReviewReady,
  SignInRequired,
} from "../api/contract.ts";
import type { BootstrapState } from "../api/contract.ts";
import { CuratorStore } from "./curator-store.ts";
import {
  AuthenticationRequired,
  CuratorAccessUnavailable,
  CuratorOwnershipConflict,
} from "./errors.ts";
import type { SignedInMicrosoftAccount } from "./model.ts";
import { BetterAuthUserId, CuratorIdentity } from "./model.ts";
import { LibraryStore } from "../library/library-store.ts";
import { LibraryIndex } from "../library/library-index.ts";
import { PhotoStore } from "../photo/photo-store.ts";

/** Authentication and single-Curator authorization policy. */
export interface CuratorAccessService {
  readonly bootstrap: (headers: Headers) => Effect.Effect<BootstrapState, CuratorAccessUnavailable>;
  readonly requireSignedIn: (
    headers: Headers,
  ) => Effect.Effect<SignedInMicrosoftAccount, AuthenticationRequired | CuratorAccessUnavailable>;
  readonly requireCurator: (
    headers: Headers,
  ) => Effect.Effect<
    SignedInMicrosoftAccount,
    AuthenticationRequired | CuratorOwnershipConflict | CuratorAccessUnavailable
  >;
  readonly claim: (
    account: SignedInMicrosoftAccount,
  ) => Effect.Effect<BootstrapState, CuratorOwnershipConflict | CuratorAccessUnavailable>;
}

/** Authentication and single-Curator authorization policy. */
export class CuratorAccess extends Context.Service<CuratorAccess, CuratorAccessService>()(
  "throwback/curator/CuratorAccess",
) {}

function unavailable(): CuratorAccessUnavailable {
  return new CuratorAccessUnavailable({
    message: "Aanmelding en Curator-eigenaarschap konden niet veilig worden gecontroleerd.",
  });
}

function accountDisplay(account: SignedInMicrosoftAccount) {
  return account.display;
}

/** Build Curator access policy from its session and persistence authorities. */
export const CuratorAccessLive = Layer.effect(
  CuratorAccess,
  Effect.gen(function* () {
    const sessions = yield* ApplicationSession;
    const store = yield* CuratorStore;
    const libraries = yield* LibraryStore;
    const indexes = yield* LibraryIndex;
    const photos = yield* PhotoStore;

    const nextSetupState = Effect.fn("CuratorAccess.nextSetupState")(function* (
      account: SignedInMicrosoftAccount,
    ): Effect.fn.Return<BootstrapState, CuratorAccessUnavailable> {
      if (!account.hasGraphConnection) {
        return GraphConnectionRequired.make({ account: accountDisplay(account) });
      }

      const library = yield* libraries
        .getSelected(account.identity)
        .pipe(Effect.mapError(unavailable));

      if (Option.isNone(library)) {
        return LibrarySelectionRequired.make({});
      }

      const progress = yield* indexes
        .startOrResume(account, library.value)
        .pipe(Effect.mapError(unavailable));

      if (!progress.reviewBlocked) {
        const firstPhoto = yield* photos
          .firstReviewablePhoto(library.value.id)
          .pipe(Effect.mapError(unavailable));

        if (Option.isSome(firstPhoto)) {
          return ReviewReady.make({
            libraryId: firstPhoto.value.libraryId,
            eventId: firstPhoto.value.eventId,
            photoId: firstPhoto.value.photoId,
          });
        }
      }

      return LibraryIndexing.make({
        libraryId: library.value.id,
        rootFolder: library.value.root,
        progress,
      });
    });

    const findSignedIn = Effect.fn("CuratorAccess.findSignedIn")(function* (headers: Headers) {
      const sessionOption = yield* sessions.get(headers).pipe(Effect.mapError(unavailable));

      if (Option.isNone(sessionOption)) {
        return Option.none();
      }

      const userId = BetterAuthUserId.make(sessionOption.value.user.id);
      const account = yield* store.findMicrosoftAccount(userId).pipe(Effect.mapError(unavailable));

      if (Option.isNone(account)) {
        return Option.none();
      }

      return Option.some({
        userId,
        betterAuthAccountId: account.value.betterAuthAccountId,
        graphConnectionVersion: account.value.graphConnectionVersion,
        identity: CuratorIdentity.make({
          providerId: "microsoft",
          providerAccountId: account.value.providerAccountId,
        }),
        display: {
          provider: "microsoft",
          name: sessionOption.value.user.name,
          email: sessionOption.value.user.email,
        },
        hasGraphConnection: account.value.hasGraphConnection,
      } satisfies SignedInMicrosoftAccount);
    });

    const requireSignedIn = Effect.fn("CuratorAccess.requireSignedIn")(function* (
      headers: Headers,
    ) {
      const account = yield* findSignedIn(headers);

      if (Option.isNone(account)) {
        return yield* new AuthenticationRequired({
          message: "Meld je aan met het Microsoft-account van de Curator.",
        });
      }

      return account.value;
    });

    const requireCurator = Effect.fn("CuratorAccess.requireCurator")(function* (headers: Headers) {
      const account = yield* requireSignedIn(headers);
      const owner = yield* store.getOwner.pipe(Effect.mapError(unavailable));

      if (
        Option.isNone(owner) ||
        owner.value.providerAccountId !== account.identity.providerAccountId
      ) {
        return yield* new CuratorOwnershipConflict({
          message: "Dit Microsoft-account is niet de Curator van deze installatie.",
        });
      }

      return account;
    });

    const bootstrap = Effect.fn("CuratorAccess.bootstrap")(function* (headers: Headers) {
      const account = yield* findSignedIn(headers);

      if (Option.isNone(account)) {
        return SignInRequired.make({ reason: "signedOut" });
      }

      const owner = yield* store.getOwner.pipe(Effect.mapError(unavailable));

      if (Option.isNone(owner)) {
        return CuratorClaimRequired.make({ account: accountDisplay(account.value) });
      }

      if (owner.value.providerAccountId !== account.value.identity.providerAccountId) {
        return SignInRequired.make({ reason: "ownerMismatch" });
      }

      return yield* nextSetupState(account.value);
    });

    const claim = Effect.fn("CuratorAccess.claim")(function* (account: SignedInMicrosoftAccount) {
      const owner = yield* store.claim(account.identity).pipe(Effect.mapError(unavailable));

      if (owner.providerAccountId !== account.identity.providerAccountId) {
        return yield* new CuratorOwnershipConflict({
          message: "Een ander Microsoft-account heeft deze installatie al geclaimd.",
        });
      }

      return yield* nextSetupState(account);
    });

    return CuratorAccess.of({ bootstrap, claim, requireCurator, requireSignedIn });
  }),
);
