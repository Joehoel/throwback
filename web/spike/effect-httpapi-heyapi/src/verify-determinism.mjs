import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files.sort();
}

async function snapshot() {
  const files = [resolve(root, "openapi.json"), ...(await listFiles(resolve(root, "generated")))];
  const hashes = new Map();
  for (const file of files) {
    const content = await readFile(file);
    hashes.set(relative(root, file), createHash("sha256").update(content).digest("hex"));
  }
  return hashes;
}

const before = await snapshot();
const generation = spawnSync("npm", ["run", "generate"], { cwd: root, encoding: "utf8" });
assert.equal(generation.status, 0, `${generation.stdout}${generation.stderr}`);
assert.deepEqual(await snapshot(), before);

console.log("OpenAPI and Hey API output are byte-for-byte deterministic across two runs.");
