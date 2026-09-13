import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { makeD1CuratorStore } from "./curator-store.ts";
import type { CuratorDatabase } from "./curator-store.ts";
import { BetterAuthUserId, CuratorIdentity, MicrosoftAccountId } from "./model.ts";

const migrationPath = fileURLToPath(
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
);

function makeMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");

  database.exec(readFileSync(migrationPath, "utf8"));

  return database;
}

function asCuratorDatabase(database: DatabaseSync): CuratorDatabase {
  return {
    prepare(query) {
      const statement = database.prepare(query);

      let parameters: readonly (string | number | null)[] = [];

      const prepared = {
        bind(...values: readonly (string | number | null)[]) {
          parameters = values;

          return prepared;
        },
        async first() {
          return Schema.decodeUnknownSync(
            Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
          )(statement.get(...parameters) ?? null);
        },
        async run() {
          const result = statement.run(...parameters);

          return { meta: { changes: Number(result.changes) } };
        },
      };

      return prepared;
    },
  };
}

function insertMicrosoftAccount(
  database: DatabaseSync,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly accessToken?: string | null;
    readonly refreshToken?: string | null;
    readonly scope?: string | null;
  },
): void {
  database
    .prepare(
      `INSERT INTO "user"
        ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       VALUES (?, 'Curator', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(input.userId, `${input.userId}@example.invalid`);
  database
    .prepare(
      `INSERT INTO "account"
        ("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "scope", "createdAt", "updatedAt")
       VALUES (?, ?, 'microsoft', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(
      `account-${input.userId}`,
      input.accountId,
      input.userId,
      input.accessToken ?? null,
      input.refreshToken ?? null,
      input.scope ?? null,
    );
}

describe("D1 Curator store", () => {
  it("migrates an empty database and resolves the stable Microsoft account", async () => {
    const database = makeMigratedDatabase();
    insertMicrosoftAccount(database, {
      userId: "user-a",
      accountId: "oid-a",
      accessToken: "encrypted-access-token",
      refreshToken: "encrypted-refresh-token",
      scope: "openid,email,Files.ReadWrite,offline_access",
    });
    const store = makeD1CuratorStore(asCuratorDatabase(database));

    const account = await Effect.runPromise(
      store.findMicrosoftAccount(BetterAuthUserId.make("user-a")),
    );

    expect(Option.getOrThrow(account)).toEqual({
      providerAccountId: MicrosoftAccountId.make("oid-a"),
      hasGraphConnection: true,
    });
  });

  it("does not call a scope-only account a durable Graph connection", async () => {
    const database = makeMigratedDatabase();
    insertMicrosoftAccount(database, {
      userId: "user-a",
      accountId: "oid-a",
      scope: "Files.ReadWrite offline_access",
    });
    const store = makeD1CuratorStore(asCuratorDatabase(database));

    const account = await Effect.runPromise(
      store.findMicrosoftAccount(BetterAuthUserId.make("user-a")),
    );

    expect(Option.getOrThrow(account).hasGraphConnection).toBe(false);
  });

  it("lets only one of two concurrent Microsoft accounts claim the installation", async () => {
    const database = makeMigratedDatabase();
    const store = makeD1CuratorStore(asCuratorDatabase(database));

    const first = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-a"),
    });

    const second = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-b"),
    });

    await Promise.all([
      Effect.runPromise(store.claim(first)),
      Effect.runPromise(store.claim(second)),
    ]);

    const owner = await Effect.runPromise(store.getOwner);

    expect([first, second]).toContainEqual(Option.getOrThrow(owner));

    expect(database.prepare('SELECT COUNT(*) AS "count" FROM "curator_owner"').get()).toEqual({
      count: 1,
    });
  });

  it("makes a repeated claim by the owner idempotent", async () => {
    const database = makeMigratedDatabase();
    const store = makeD1CuratorStore(asCuratorDatabase(database));

    const owner = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-a"),
    });

    await Effect.runPromise(store.claim(owner));
    await expect(Effect.runPromise(store.claim(owner))).resolves.toEqual(owner);
  });
});
