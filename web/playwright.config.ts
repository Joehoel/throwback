import { defineConfig, devices } from "@playwright/test";

const port = 3000;

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.test.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 15 Pro"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    env: {
      BETTER_AUTH_SECRET: "e2e-only-placeholder-secret-at-least-32-characters",
      GEMINI_API_KEY: "e2e-placeholder",
      MICROSOFT_CLIENT_ID: "e2e-placeholder",
      MICROSOFT_CLIENT_SECRET: "e2e-placeholder",
      THROWBACK_BUILD_ID: "e2e",
    },
    url: `${baseURL}/api/openapi.json`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
