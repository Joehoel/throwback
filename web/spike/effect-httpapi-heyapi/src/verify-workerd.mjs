import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = 3000;
const origin = `http://127.0.0.1:${port}`;
const webPath = fileURLToPath(new URL("../../../", import.meta.url));
const configPath = fileURLToPath(new URL("../vite.workerd.config.ts", import.meta.url));
const output = [];
const worker = spawn(
  "bunx",
  ["vite", "dev", "--config", configPath, "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: webPath,
    detached: true,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

worker.stdout.on("data", (chunk) => output.push(chunk.toString()));
worker.stderr.on("data", (chunk) => output.push(chunk.toString()));

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (worker.exitCode !== null) {
      throw new Error(`workerd exited before startup:\n${output.join("")}`);
    }
    try {
      await fetch(`${origin}/prototypes/httpapi-client`);
      return;
    } catch {
      // The socket is expected to reject while workerd is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for workerd:\n${output.join("")}`);
}

try {
  await waitUntilReady();

  const spaPage = await fetch(`${origin}/prototypes/httpapi-client`);
  assert.equal(spaPage.status, 200, await spaPage.text());

  const unauthorized = await fetch(
    `${origin}/prototypes/httpapi/drives/drive-1/photos/photo-1?projectionRevision=1`,
  );
  const unauthorizedBody = await unauthorized.text();
  assert.equal(unauthorized.status, 401, `${unauthorizedBody}\n${output.join("")}`);

  const photo = await fetch(
    `${origin}/prototypes/httpapi/drives/drive-1/photos/photo-1?projectionRevision=1`,
    { headers: { Cookie: "throwback_session=valid-session" } },
  );
  assert.equal(photo.status, 200);
  assert.equal((await photo.json()).driveItemId, "photo-1");

  const approval = await fetch(
    `${origin}/prototypes/httpapi/drives/drive-1/photos/photo-1/approvals`,
    {
      method: "POST",
      headers: {
        Cookie: "throwback_session=valid-session",
        "Content-Type": "application/json",
        "Idempotency-Key": "workerd",
        "If-Match": '\"etag-current\"',
      },
      body: JSON.stringify({ description: null, location: null, orientation: 1 }),
    },
  );
  assert.equal(approval.status, 202);

  const preview = await fetch(
    `${origin}/prototypes/httpapi/drives/drive-1/photos/photo-1/preview`,
    { headers: { Cookie: "throwback_session=valid-session" } },
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Array.from(new Uint8Array(await preview.arrayBuffer())), [0xff, 0xd8, 0xff, 0xd9]);

  console.log("TanStack Start SPA route and mounted Effect handler passed in local workerd.");
} finally {
  if (worker.pid !== undefined) process.kill(-worker.pid, "SIGTERM");
}
