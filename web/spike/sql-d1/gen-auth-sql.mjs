// Generate the better-auth NATIVE-D1 migration SQL (no drizzle) to compare against the committed
// drizzle-kit-generated drizzle/0000_naive_vector.sql. Same better-auth config as src/lib/auth.ts.
import { Miniflare } from "miniflare";
import { getMigrations } from "better-auth/db/migration";

const mf = new Miniflare({ modules: true, script: "export default {};", compatibilityDate: "2025-09-02", d1Databases: { DB: "gen" } });
const db = await mf.getD1Database("DB");

let plugins = [];
try {
  const { tanstackStartCookies } = await import("better-auth/tanstack-start");
  plugins = [tanstackStartCookies()];
} catch { /* plugin doesn't affect schema; ignore if import shape differs */ }

const options = {
  database: db,
  secret: "spike-secret-please-ignore-0123456789",
  baseURL: "http://localhost:3000",
  emailAndPassword: { enabled: true },
  socialProviders: { microsoft: { clientId: "x", clientSecret: "x", tenantId: "consumers" } },
  plugins,
};

const { compileMigrations, toBeCreated } = await getMigrations(options);
console.log("tables:", (toBeCreated ?? []).map((t) => t.table ?? t).join(", "));
const sql = await compileMigrations();
console.log("\n===== NATIVE better-auth SQL =====\n");
console.log(sql);
await mf.dispose();
