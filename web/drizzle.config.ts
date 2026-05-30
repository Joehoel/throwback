import { defineConfig } from 'drizzle-kit'

// `generate` only reads the schema → no DB credentials needed. Migrations are
// applied to D1 via `wrangler d1 migrations apply throwback-web` (--local / --remote).
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
})
