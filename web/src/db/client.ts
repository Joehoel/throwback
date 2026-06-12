import { D1Client } from "@effect/sql-d1";
import { env } from "#/env";
import { makeRuntime } from "#/effect/runtime.ts";

/**
 * Runtime `SqlClient` layer bound to the Worker's D1 binding (ADR-0009/0012: app
 * tables via @effect/sql-d1). In tests, provide `D1Client.layer({ db })` from a
 * miniflare D1 instead.
 *
 * Imports `#/env` (`cloudflare:workers`) → loads only inside the Worker.
 */
export const SqlLive = D1Client.layer({ db: env.DB });

/**
 * Server-edge D1 runtime: builds `SqlLive` once and memoizes it — run the runtime
 * at the edge, *once*, rather than `Effect.provide(SqlLive)` per request. Server
 * fns / handlers call `DbRuntime.runPromise(repoEffect)`. (v4 `Effect` has
 * covariant `R`, so repo effects requiring only `SqlClient` run on the
 * `D1Client | SqlClient` runtime directly.)
 */
export const DbRuntime = makeRuntime(SqlLive);
