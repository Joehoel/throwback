import { Context, Effect, Layer, Option, Schema } from "effect";
import type { BetterAuthUserId, CuratorIdentity, MicrosoftAccountId } from "./model.ts";
import {
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

interface PreparedStatement {
  readonly bind: (...values: readonly (string | number | null)[]) => PreparedStatement;
  readonly first: () => Promise<object | null>;
  readonly run: () => Promise<{ readonly meta: { readonly changes: number } }>;
}

/** Minimal D1 surface used by the Curator persistence adapter. */
export interface CuratorDatabase {
  readonly prepare: (query: string) => PreparedStatement;
}

const StoredOwner = Schema.Struct({
  providerId: Schema.Literal("microsoft"),
  providerAccountId: MicrosoftAccountIdSchema,
});

const StoredMicrosoftAccount = Schema.Struct({
  providerAccountId: MicrosoftAccountIdSchema,
  accessToken: Schema.NullOr(Schema.String),
  refreshToken: Schema.NullOr(Schema.String),
  scope: Schema.NullOr(Schema.String),
});

const RunResult = Schema.Struct({
  meta: Schema.Struct({ changes: Schema.Number }),
});

const decodeOptionalOwner = Schema.decodeUnknownEffect(Schema.NullOr(StoredOwner));

const decodeOptionalMicrosoftAccount = Schema.decodeUnknownEffect(
  Schema.NullOr(StoredMicrosoftAccount),
);

const decodeRunResult = Schema.decodeUnknownEffect(RunResult);

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

/** Build the D1-backed Curator persistence implementation. */
export function makeD1CuratorStore(database: CuratorDatabase): CuratorStoreService {
  const getOwner = Effect.tryPromise({
    try: () =>
      database
        .prepare(
          'SELECT "providerId", "providerAccountId" FROM "curator_owner" WHERE "singleton" = 1',
        )
        .first(),
    catch: storeFailure("getOwner"),
  }).pipe(
    Effect.flatMap(decodeOptionalOwner),
    Effect.mapError(storeFailure("getOwner")),
    Effect.map(Option.fromNullishOr),
  );

  const findMicrosoftAccount = Effect.fn("CuratorStore.findMicrosoftAccount")(function* (
    userId: BetterAuthUserId,
  ) {
    const row = yield* Effect.tryPromise({
      try: () =>
        database
          .prepare(
            `SELECT
                "accountId" AS "providerAccountId",
                "accessToken",
                "refreshToken",
                "scope"
              FROM "account"
              WHERE "userId" = ? AND "providerId" = 'microsoft'
              LIMIT 1`,
          )
          .bind(userId)
          .first(),
      catch: storeFailure("findMicrosoftAccount"),
    }).pipe(
      Effect.flatMap(decodeOptionalMicrosoftAccount),
      Effect.mapError(storeFailure("findMicrosoftAccount")),
    );

    if (row === null) {
      return Option.none();
    }

    return Option.some({
      providerAccountId: row.providerAccountId,
      hasGraphConnection:
        row.refreshToken !== null &&
        row.accessToken !== null &&
        includesScope(row.scope, "Files.ReadWrite"),
    });
  });

  const claim = Effect.fn("CuratorStore.claim")(function* (identity: CuratorIdentity) {
    const result = yield* Effect.tryPromise({
      try: () =>
        database
          .prepare(
            `INSERT INTO "curator_owner" ("singleton", "providerId", "providerAccountId")
             VALUES (1, ?, ?)
             ON CONFLICT("singleton") DO NOTHING`,
          )
          .bind(identity.providerId, identity.providerAccountId)
          .run(),
      catch: storeFailure("claim"),
    }).pipe(Effect.flatMap(decodeRunResult), Effect.mapError(storeFailure("claim")));

    if (result.meta.changes === 1) {
      return identity;
    }

    const owner = yield* getOwner;

    if (Option.isNone(owner)) {
      return yield* new CuratorStoreError({
        operation: "claim",
        message: "De Curator-claim kon niet veilig worden bevestigd.",
      });
    }

    return CuratorIdentitySchema.make(owner.value);
  });

  return CuratorStore.of({ claim, findMicrosoftAccount, getOwner });
}

/** Provide a D1-backed Curator store. */
export function layerD1CuratorStore(database: CuratorDatabase): Layer.Layer<CuratorStore> {
  return Layer.succeed(CuratorStore, makeD1CuratorStore(database));
}
