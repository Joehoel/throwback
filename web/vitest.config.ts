import { fileURLToPath } from "node:url";
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
 * Test environments are split into `projects` (added per phase):
 * - `unit` — node; pure Effect/Schema + XState actor logic.
 * - `d1`   — `@cloudflare/vitest-pool-workers`; real `env.DB` (added in phase 1).
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
    ],
  },
});
