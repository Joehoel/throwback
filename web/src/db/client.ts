import { D1Client } from "@effect/sql-d1";
import { env } from "#/env";

/**
 * Runtime `SqlClient` layer bound to the Worker's D1 binding (ADR-0009/0012: app
 * tables via @effect/sql-d1). Provide this under the oRPC procedure's runtime so
 * the photo-index / write-queue repos resolve their `SqlClient` dependency. In
 * tests, provide `D1Client.layer({ db })` from a miniflare D1 instead.
 *
 * Imports `#/env` (`cloudflare:workers`) → loads only inside the Worker.
 */
export const SqlLive = D1Client.layer({ db: env.DB });
