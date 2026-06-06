import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — kept separate from `vite.config.ts` on purpose: the app config
 * loads the full TanStack Start + devtools + React-compiler-babel plugin stack,
 * which is the wrong (and slow) base for tests.
 *
 * The `exclude` is load-bearing: `.context/` holds gitignored *reference* repos
 * (effect-smol, alchemy, opencode) full of their own `*.test.ts`. Without scoping,
 * Vitest globs and runs them — alchemy's suite provisions and deletes real
 * Cloudflare resources. Every project is scoped to our own `src/`.
 *
 * Test environments are split into `projects`:
 * - `unit` — node; pure Effect/Schema + XState actor logic.
 * - `d1`   — `@cloudflare/vitest-pool-workers`; the repos against a real (workerd)
 *            D1, with the app's drizzle migrations applied.
 * - `browser` — `@vitest/browser` + Playwright (added in phase 3).
 */

const srcRoot = fileURLToPath(new URL("src", import.meta.url));

const ignored = [
  "**/node_modules/**",
  ".context/**",
  "spike/**",
  "dist/**",
  ".alchemy/**",
  ".wrangler/**",
];

/**
 * Build a `D1Migration[]` from the drizzle SQL files. We can't use the pool's
 * `readD1Migrations` here: it splits on `;`, but drizzle separates statements
 * with `--> statement-breakpoint` and emits no semicolons. Passed to the worker
 * as a binding so the d1 setup can `applyD1Migrations`.
 */
function readDrizzleMigrations(files: string[]) {
  return Promise.all(
    files.map(async (name) => {
      const body = await readFile(new URL(`drizzle/${name}`, import.meta.url), "utf8");
      const queries = body
        .split("--> statement-breakpoint")
        .map((chunk) =>
          chunk
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter(Boolean);
      return { name, queries };
    }),
  );
}

export default defineConfig({
  resolve: {
    // Mirror the `#/* -> ./src/*` subpath import (package.json `imports`, tsconfig paths).
    alias: [{ find: /^#\/(?<path>.*)$/u, replacement: `${srcRoot}/$<path>` }],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          // db/** needs a real D1 (the `d1` project); browser tests run in Playwright.
          exclude: [...ignored, "src/db/**", "src/**/*.browser.test.tsx"],
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readDrizzleMigrations([
              "0001_photo_index.sql",
              "0002_write_jobs.sql",
            ]);
            return {
              miniflare: {
                compatibilityDate: "2025-09-02",
                compatibilityFlags: ["nodejs_compat"],
                d1Databases: ["DB"],
                // Test-only binding — the repos test applies these in `beforeAll`.
                bindings: { TEST_MIGRATIONS: migrations },
              },
            };
          }),
        ],
        test: {
          name: "d1",
          include: ["src/db/**/*.test.ts"],
          exclude: ignored,
        },
      },
    ],
  },
});
