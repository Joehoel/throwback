import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { sqliteD1Database } from "../test-support/sqlite-d1.ts";
import { CuratorStore, CuratorStoreLive } from "./curator-store.ts";
import {
  BetterAuthAccountId,
  BetterAuthUserId,
  CuratorIdentity,
  GraphConnectionVersion,
  MicrosoftAccountId,
} from "./model.ts";

const migrationPath = fileURLToPath(
  new URL("../../../migrations/0001_auth_and_curator.sql", import.meta.url),
);

function makeMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");

  database.exec(readFileSync(migrationPath, "utf8"));

  return database;
}

function storeLayer(database: DatabaseSync) {
  return CuratorStoreLive.pipe(Layer.provide(D1Client.layer({ db: sqliteD1Database(database) })));
}

function insertMicrosoftAccount(
  database: DatabaseSync,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly accessToken?: string | null;
    readonly refreshToken?: string | null;
    readonly scope?: string | null;
    readonly updatedAt?: string;
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
        VALUES (?, ?, 'microsoft', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `account-${input.userId}`,
      input.accountId,
      input.userId,
      input.accessToken ?? null,
      input.refreshToken ?? null,
      input.scope ?? null,
      input.updatedAt ?? "2026-01-01 00:00:00",
      input.updatedAt ?? "2026-01-01 00:00:00",
    );
}

describe("Effect SQL D1 Curator store", () => {
  it("migrates an empty database and resolves the stable Microsoft account", async () => {
    const database = makeMigratedDatabase();
    insertMicrosoftAccount(database, {
      userId: "user-a",
      accountId: "oid-a",
      accessToken: "encrypted-access-token",
      refreshToken: "encrypted-refresh-token",
      scope: "openid,email,Files.ReadWrite,offline_access",
    });

    const account = await Effect.runPromise(
      CuratorStore.pipe(
        Effect.flatMap((store) => store.findMicrosoftAccount(BetterAuthUserId.make("user-a"))),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(Option.getOrThrow(account)).toEqual({
      betterAuthAccountId: BetterAuthAccountId.make("account-user-a"),
      graphConnectionVersion: GraphConnectionVersion.make("2026-01-01 00:00:00"),
      providerAccountId: MicrosoftAccountId.make("oid-a"),
      hasGraphConnection: true,
    });
  });

  it("requires token custody and both delegated Graph scopes", async () => {
    const database = makeMigratedDatabase();
    insertMicrosoftAccount(database, {
      userId: "user-a",
      accountId: "oid-a",
      accessToken: "encrypted-access-token",
      refreshToken: "encrypted-refresh-token",
      scope: "Files.ReadWrite",
    });

    const account = await Effect.runPromise(
      CuratorStore.pipe(
        Effect.flatMap((store) => store.findMicrosoftAccount(BetterAuthUserId.make("user-a"))),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(Option.getOrThrow(account).hasGraphConnection).toBe(false);
  });

  it("lets only one of two concurrent Microsoft accounts claim the installation", async () => {
    const database = makeMigratedDatabase();
    const layer = storeLayer(database);

    const first = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-a"),
    });

    const second = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-b"),
    });

    await Effect.runPromise(
      CuratorStore.pipe(
        Effect.flatMap((store) =>
          Effect.all([store.claim(first), store.claim(second)], { concurrency: "unbounded" }),
        ),
        Effect.provide(layer),
      ),
    );

    const owner = await Effect.runPromise(
      CuratorStore.pipe(
        Effect.flatMap((store) => store.getOwner),
        Effect.provide(layer),
      ),
    );

    expect([first, second]).toContainEqual(Option.getOrThrow(owner));
    expect(database.prepare('SELECT COUNT(*) AS "count" FROM "curator_owner"').get()).toEqual({
      count: 1,
    });
  });

  it("makes a repeated claim by the owner idempotent", async () => {
    const database = makeMigratedDatabase();

    const owner = CuratorIdentity.make({
      providerId: "microsoft",
      providerAccountId: MicrosoftAccountId.make("oid-a"),
    });

    const repeated = await Effect.runPromise(
      CuratorStore.pipe(
        Effect.flatMap((store) => store.claim(owner).pipe(Effect.andThen(store.claim(owner)))),
        Effect.provide(storeLayer(database)),
      ),
    );

    expect(repeated).toEqual(owner);
  });
});
