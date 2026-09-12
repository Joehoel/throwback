import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const forbiddenPaths = [
  "drizzle",
  "infra/cloudflare",
  "spike",
  ".cta.json",
  ".cursorrules",
  "wrangler.jsonc",
  "public/prototypes",
  "src/db",
  "src/domains",
  "src/effect",
  "src/orpc",
  "src/env.ts",
  "src/runtime.ts",
  "src/integrations/better-auth",
  "src/lib/auth-client.ts",
  "src/lib/auth-server.ts",
  "src/lib/auth.ts",
  "src/lib/cn.ts",
  "src/polyfill.ts",
  "src/routes/api.$.ts",
  "src/routes/api.rpc.$.ts",
  "src/routes/api/drive.ts",
  "src/routes/curate.tsx",
  "src/routes/prototypes",
  "src/types/file-system-access.d.ts",
] as const;

const forbiddenDependencies = [
  "@orpc/client",
  "@orpc/json-schema",
  "@orpc/openapi",
  "@orpc/server",
  "@orpc/tanstack-query",
  "@orpc/zod",
  "@tanstack/ai",
  "@tanstack/ai-anthropic",
  "@tanstack/ai-client",
  "@tanstack/ai-gemini",
  "@tanstack/ai-ollama",
  "@tanstack/ai-openai",
  "@tanstack/ai-react",
  "@xstate/graph",
  "@xstate/react",
  "piexifjs",
  "xstate",
  "zod",
] as const;

const forbiddenRouteFragments = ["/api/drive", "/api/rpc/", "/curate", "/prototypes/"] as const;

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.resolve(root, relativePath));

    return true;
  } catch {
    return false;
  }
}

async function verifyCleanRebuild(): Promise<string> {
  const checkedPaths = await Promise.all(
    forbiddenPaths.map(async (relativePath) => ({
      exists: await pathExists(relativePath),
      relativePath,
    })),
  );

  const existingPaths = checkedPaths.filter(({ exists }) => exists);

  const packageJson = await readFile(path.resolve(root, "package.json"), "utf8");

  const remainingDependencies = forbiddenDependencies.filter((dependency) =>
    packageJson.includes(`"${dependency}":`),
  );

  const routeTree = await readFile(path.resolve(root, "src/routeTree.gen.ts"), "utf8");

  const remainingRoutes = forbiddenRouteFragments.filter((fragment) =>
    routeTree.includes(fragment),
  );

  const failures = [
    ...existingPaths.map(({ relativePath }) => `forbidden path remains: ${relativePath}`),
    ...remainingDependencies.map((dependency) => `forbidden dependency remains: ${dependency}`),
    ...remainingRoutes.map((route) => `forbidden generated route remains: ${route}`),
  ];

  if (failures.length > 0) {
    throw new Error(`Prototype cleanup is incomplete:\n${failures.join("\n")}`);
  }

  return "Prototype routes, implementation paths, and dependencies are absent.\n";
}

stdout.write(await verifyCleanRebuild());
