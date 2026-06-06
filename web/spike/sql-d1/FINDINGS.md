# Spike #2: @effect/sql-d1 + better-auth on D1 — FINDINGS

`effect@4.0.0-beta.78`, `@effect/sql-d1@4.0.0-beta.78`, `better-auth@1.6.14`, `kysely@0.28.17`,
`better-auth-cloudflare@0.3.0`, `miniflare@^4`. Run: `npm i && node checkA.mjs && node checkD.mjs`.

## Verdict: drizzle-free is the right call ✅ — better-auth has NATIVE D1 support

Pass the raw D1 binding straight to better-auth (`database: env.DB`). No drizzle, no external dialect,
**zero extra packages.** App tables on `@effect/sql-d1`. Both libraries hit the same `env.DB`.

## Part A — `@effect/sql-d1` + `PhotoFromRow` ✅ PASS (`checkA.mjs`)

Against real miniflare D1: `D1Client.layer({ db })` → `SqlClient` (`effect/unstable/sql`); tagged-template
queries; the ported v4 `PhotoFromRow` codec decodes real rows incl. NULLs, parses the `location` JSON,
applies `encodeKeys` renames, and `WHERE description IS NULL` returns the right photo. Persistence layer
and v4 schema validated end-to-end.

## Part D — better-auth CORE on raw D1 ✅ PASS (`checkD.mjs`) — THE ANSWER

```js
const auth = betterAuth({ database: env.DB, emailAndPassword: { enabled: true }, /* ... */ })
```
`getMigrations(options).runMigrations()` created `user/session/account/verification`; signup + signin
worked; the user row landed in D1. better-auth detects a `D1Database` and uses its **built-in** Kysely D1
dialect, whose introspection is D1-safe. **No drizzle, no `kysely-d1`, no wrapper.** (kysely is already a
better-auth dependency — pinned via the existing `kysely: 0.28.17` override; nothing new to add.)

## Part B — external `kysely-d1` ❌ FAIL (`checkB.mjs`) — DON'T use this

`database: { dialect: new D1Dialect(...) /* kysely-d1 */, type: "sqlite" }` → migration dies with
`D1_ERROR: not authorized: SQLITE_AUTH` (the external dialect's introspector hits D1's authorizer), plus
a version-drift warning (`kysely-d1@0.4.0` lags `kysely@0.28`). This was the wrong approach — superseded
by Part D. (Matches better-auth issues #7487/#3552, which are about the external dialect.)

## Part C — `better-auth-cloudflare` d1Native ✅ PASS (`checkC.mjs`) — works, but unnecessary

`withCloudflare({ d1Native: db }, options)` passes the raw binding to better-auth's native dialect (same
as Part D) and adds geolocation/KV/R2/IP features. Migrations + auth pass. But it **depends on
drizzle-orm** + `@better-auth/drizzle-adapter` and bundles features a single-user photo tool doesn't
need. Its other mode (`d1`) is explicitly Drizzle. → Not needed; Part D is leaner.

## Decision

**Drop drizzle entirely** (confirms the 2026-06-06 removal): better-auth via native D1
(`database: env.DB`), app tables via `@effect/sql-d1`. Migrations: better-auth's own generated SQL applied
through the same Alchemy/D1 path as the app tables. No `drizzle-orm`, `drizzle-kit`, `better-sqlite3`,
`kysely-d1`, or `better-auth-cloudflare`.
