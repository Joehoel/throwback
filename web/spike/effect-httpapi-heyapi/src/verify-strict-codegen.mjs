import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tscPath = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const configPath = fileURLToPath(new URL("../tsconfig.strict-generated.json", import.meta.url));
const result = spawnSync(process.execPath, [tscPath, "-p", configPath], { encoding: "utf8" });
const diagnostics = `${result.stdout}${result.stderr}`;

assert.notEqual(result.status, 0, "Hey API bundled runtime unexpectedly passed strict codegen check");
assert.match(diagnostics, /TS2379|TS2375/);
assert.match(diagnostics, /exactOptionalPropertyTypes: true/);
assert.match(diagnostics, /generated\/client\//);

console.log("Confirmed: @hey-api/openapi-ts 0.99.0 bundled Fetch runtime fails exact optional typing.");
