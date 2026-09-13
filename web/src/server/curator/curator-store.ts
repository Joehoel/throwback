import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import type {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  MicrosoftAccountId,
} from "./model.ts";
import {
  BetterAuthAccountId as BetterAuthAccountIdSchema,
  BetterAuthUserId as BetterAuthUserIdSchema,
  CuratorIdentity as CuratorIdentitySchema,
  MicrosoftAccountId as MicrosoftAccountIdSchema,
} from "./model.ts";

/** Database operations whose failures are safe to expose to application policy. */
export class CuratorStoreError extends Schema.TaggedError<CuratorStoreError>()(
  "CuratorStoreError",
  {
    operation: Schema.Literals(["findMicrosoftAccount", "getOwner", "claim"]),
    message: Schema.String,
  },
) {}

/** The Microsoft account fields needed for authorization and Graph readiness. */
export interface MicrosoftAccountBinding {
  readonly betterAuthAccountId: BetterAuthAccountId;
  readonly providerAccountId: MicrosoftAccountId;
  readonly hasGraphConnection: boolean;
}

/** Persistence authority for the single Curator and Better Auth's Microsoft binding. */
export interface CuratorStoreService {
  readonly findMicrosoftAccount: (
    userId: BetterAuthUserId,
  ) => Effect.Effect<Option.Option<MicrosoftAccountBinding>, CuratorStoreError>;
  readonly getOwner: Effect.Effect<Option.Option<CuratorIdentity>, CuratorStoreError>;
  readonly claim: (identity: CuratorIdentity) => Effect.Effect<CuratorIdentity, CuratorStoreError>;
}

/** Persistence authority for the single Curator and Better Auth's Microsoft binding. */
export class CuratorStore extends Context.Service<CuratorStore, CuratorStoreService>()(
  "throwback/curator/CuratorStore",
) {}

const MicrosoftAccountRow = Schema.Struct({
  betterAuthAccountId: BetterAuthAccountIdSchema,
  providerAccountId: MicrosoftAccountIdSchema,
  accessToken: Schema.NullOr(Schema.String),
  refreshToken: Schema.NullOr(Schema.String),
  scope: Schema.NullOr(Schema.String),
});

function storeFailure(
  operation: CuratorStoreError["operation"],
): (cause: unknown) => CuratorStoreError {
  return () =>
    new CuratorStoreError({
      operation,
      message: "De beveiligde Curator-opslag is tijdelijk niet beschikbaar.",
    });
}

function includesScope(scope: string | null, required: string): boolean {
  return scope?.split(/[\s,]+/u).includes(required) ?? false;
}

/** Effect SQL repository for the single Curator and linked Microsoft account. */
export const CuratorStoreLive = Layer.effect(
  CuratorStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const findOwner = SqlSchema.findOneOption({
      Request: Schema.Void,
      Result: CuratorIdentitySchema,
      execute: () => sql`
        SELECT
          "providerId",
          "providerAccountId"
        FROM "curator_owner"
        WHERE "singleton" = 1
      `,
    });

    const findAccount = SqlSchema.findOneOption({
      Request: BetterAuthUserIdSchema,
      Result: MicrosoftAccountRow,
      execute: (userId) => sql`
        SELECT
          "id" AS "betterAuthAccountId",
          "accountId" AS "providerAccountId",
          "accessToken",
          "refreshToken",
          "scope"
        FROM "account"
        WHERE "userId" = ${userId}
          AND "providerId" = 'microsoft'
        LIMIT 1
      `,
    });

    const insertOwner = SqlSchema.void({
      Request: CuratorIdentitySchema,
      execute: (identity) => sql`
        INSERT INTO "curator_owner" (
          "singleton",
          "providerId",
          "providerAccountId"
        ) VALUES (1, ${identity.providerId}, ${identity.providerAccountId})
        ON CONFLICT("singleton") DO NOTHING
      `,
    });

    const getOwner = findOwner().pipe(Effect.mapError(storeFailure("getOwner")));

    const findMicrosoftAccount = Effect.fn("CuratorStore.findMicrosoftAccount")(function* (
      userId: BetterAuthUserId,
    ) {
      const row = yield* findAccount(userId).pipe(
        Effect.mapError(storeFailure("findMicrosoftAccount")),
      );

      return Option.map(row, (account) => ({
        betterAuthAccountId: account.betterAuthAccountId,
        providerAccountId: account.providerAccountId,
        hasGraphConnection:
          account.refreshToken !== null &&
          account.accessToken !== null &&
          includesScope(account.scope, "Files.ReadWrite") &&
          includesScope(account.scope, "offline_access"),
      }));
    });

    const claim = Effect.fn("CuratorStore.claim")(function* (identity: CuratorIdentity) {
      yield* insertOwner(identity).pipe(Effect.mapError(storeFailure("claim")));

      const owner = yield* getOwner;

      if (Option.isNone(owner)) {
        return yield* new CuratorStoreError({
          operation: "claim",
          message: "De Curator-claim kon niet veilig worden bevestigd.",
        });
      }

      return owner.value;
    });

    return CuratorStore.of({ claim, findMicrosoftAccount, getOwner });
  }),
);
