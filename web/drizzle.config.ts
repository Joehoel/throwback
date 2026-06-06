import { defineConfig } from "drizzle-kit";

// `generate` only reads the schema → no DB credentials needed. Migrations are
// Applied to D1 via `wrangler d1 migrations apply throwback-web` (--local / --remote).
export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
