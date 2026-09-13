import { Context, Effect, Layer, Option } from "effect";
import { ApplicationSession } from "../auth/application-session.ts";
import {
  CuratorClaimRequired,
  GraphConnectionRequired,
  LibrarySelectionRequired,
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

function nextSetupState(account: SignedInMicrosoftAccount): BootstrapState {
  return account.hasGraphConnection
    ? LibrarySelectionRequired.make({})
    : GraphConnectionRequired.make({ account: accountDisplay(account) });
}

/** Build Curator access policy from its session and persistence authorities. */
export const CuratorAccessLive = Layer.effect(
  CuratorAccess,
  Effect.gen(function* () {
    const sessions = yield* ApplicationSession;
    const store = yield* CuratorStore;

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

      return nextSetupState(account.value);
    });

    const claim = Effect.fn("CuratorAccess.claim")(function* (account: SignedInMicrosoftAccount) {
      const owner = yield* store.claim(account.identity).pipe(Effect.mapError(unavailable));

      if (owner.providerAccountId !== account.identity.providerAccountId) {
        return yield* new CuratorOwnershipConflict({
          message: "Een ander Microsoft-account heeft deze installatie al geclaimd.",
        });
      }

      return nextSetupState(account);
    });

    return CuratorAccess.of({ bootstrap, claim, requireCurator, requireSignedIn });
  }),
);
