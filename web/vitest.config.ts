import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Kept separate from `vite.config.ts`: tests do not need the TanStack Start,
 * devtools, Tailwind, or React Compiler build pipeline.
 *
 * The `exclude` is load-bearing: `.context/` holds gitignored *reference* repos
 * (effect-smol, alchemy, opencode) full of their own `*.test.ts`. Without scoping,
 * Vitest globs and runs them — alchemy's suite provisions and deletes real
 * Cloudflare resources. Every project is scoped to our own `src/`.
 */

const srcRoot = fileURLToPath(new URL("src", import.meta.url));

const ignored = ["**/node_modules/**", ".context/**", "dist/**", ".alchemy/**", ".wrangler/**"];

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
          exclude: [...ignored, "src/**/*.browser.test.tsx"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          exclude: ignored,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
