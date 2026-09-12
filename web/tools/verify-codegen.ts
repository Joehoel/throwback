import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.resolve(directory, entry.name);

      return entry.isDirectory() ? listFiles(entryPath) : Promise.resolve([entryPath]);
    }),
  );

  return nestedFiles.flat().toSorted((left, right) => left.localeCompare(right));
}

async function snapshot(): Promise<Map<string, string>> {
  const generatedFiles = await listFiles(path.resolve(root, "src/client/generated"));
  const files = [path.resolve(root, "openapi.json"), ...generatedFiles];

  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file);
      const hash = createHash("sha256").update(content).digest("hex");

      const entry: [string, string] = [path.relative(root, file), hash];

      return entry;
    }),
  );

  return new Map(entries);
}

function generate(): void {
  const generation = spawnSync("bun", ["run", "generate"], { cwd: root, encoding: "utf8" });

  invariant(generation.status === 0, `${generation.stdout}${generation.stderr}`);
}

async function verifyCodegen(): Promise<string> {
  const committed = await snapshot();

  generate();

  const firstPass = await snapshot();

  invariant(
    JSON.stringify([...firstPass]) === JSON.stringify([...committed]),
    "Generated contract artifacts have drifted",
  );

  generate();

  const secondPass = await snapshot();

  invariant(
    JSON.stringify([...secondPass]) === JSON.stringify([...firstPass]),
    "Code generation is not deterministic",
  );

  return "OpenAPI and browser client generation are drift-free and deterministic.\n";
}

export const verification = stdout.write(await verifyCodegen());
