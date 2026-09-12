import { expect, test } from "@playwright/test";

let browserErrors: string[] = [];

test.beforeEach(({ page }) => {
  browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });
  page.on("response", (response) => {
    const isExpectedNotFoundNavigation =
      response.status() === 404 &&
      response.request().isNavigationRequest() &&
      new URL(response.url()).pathname === "/bestaat-niet";

    if (response.status() >= 400 && !isExpectedNotFoundNavigation) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });
});

test.afterEach(() => {
  expect(browserErrors).toStrictEqual([]);
});

test("routes the root bootstrap to sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("familiefoto's");
});

test("loads the setup shell as a direct link", async ({ page }) => {
  await page.goto("/setup/library");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kies de Hoofdmap");
});

test("loads the canonical review shell as a direct link", async ({ page }) => {
  await page.goto("/libraries/library-1/events/event-1/photos/photo-1");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Foto wordt voorbereid");
});

test("renders the application 404 shell", async ({ page }) => {
  const notFoundResponse = await page.goto("/bestaat-niet");

  expect(notFoundResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deze pagina bestaat niet.");
});

test("mounts the Effect contract with build compatibility", async ({ request }) => {
  const bootstrap = await request.get("/api/domain/bootstrap", {
    headers: { "x-throwback-build-id": "e2e" },
  });

  expect(bootstrap.status()).toBe(200);
  expect(await bootstrap.json()).toHaveProperty("_tag", "SignInRequired");

  const stale = await request.get("/api/domain/bootstrap", {
    headers: { "x-throwback-build-id": "stale-build" },
  });

  expect(stale.status()).toBe(409);
  expect(await stale.json()).toHaveProperty("_tag", "BuildUpgradeRequired");

  const openapi = await request.get("/api/openapi.json");

  expect(openapi.status()).toBe(200);
  expect(await openapi.json()).toHaveProperty("openapi", "3.1.0");
});
