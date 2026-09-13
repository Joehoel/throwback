import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const bundlePath = fileURLToPath(new URL("../dist/client/client-proof.js", import.meta.url));
const sourceMapPath = `${bundlePath}.map`;
const [bundle, sourceMapText, bundleStats] = await Promise.all([
  readFile(bundlePath, "utf8"),
  readFile(sourceMapPath, "utf8"),
  stat(bundlePath),
]);
const sourceMap = JSON.parse(sourceMapText);

assert.ok(Array.isArray(sourceMap.sources));
assert.equal(sourceMap.sources.some((source) => /node_modules\/effect|\/effect\//.test(source)), false);
assert.doesNotMatch(bundle, /effect\/unstable|EffectPrimitive|~effect\//);

console.log(`Browser proof bundle contains no Effect source (${bundleStats.size} bytes, unminified).`);
