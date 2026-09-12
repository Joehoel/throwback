import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const src = path.resolve(root, "src");

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

function importSpecifiers(file: string, source: string): string[] {
  const specifiers = new Set<string>();

  const ast = parse(source, {
    createImportExpressions: true,
    plugins: ["jsx", "typescript"],
    sourceFilename: file,
    sourceType: "module",
  });

  traverse(ast, {
    ExportAllDeclaration: ({ node }) => {
      specifiers.add(node.source.value);
    },
    ExportNamedDeclaration: ({ node }) => {
      if (node.source !== null && node.source !== undefined) {
        specifiers.add(node.source.value);
      }
    },
    ImportDeclaration: ({ node }) => {
      specifiers.add(node.source.value);
    },
    ImportExpression: ({ node }) => {
      if (node.source.type === "StringLiteral") {
        specifiers.add(node.source.value);
      }
    },
    TSExternalModuleReference: ({ node }) => {
      specifiers.add(node.expression.value);
    },
    TSImportType: ({ node }) => {
      specifiers.add(node.source.value);
    },
  });

  return [...specifiers];
}

async function verifyBoundaries(): Promise<string> {
  const allSourceFiles = await listFiles(src);

  const sourceFiles = allSourceFiles.filter(
    (file) =>
      /\.(?:ts|tsx)$/u.test(file) && !file.includes("/generated/") && !file.includes(".test."),
  );

  const sourceContents = await Promise.all(
    sourceFiles.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );

  for (const { file, source } of sourceContents) {
    const imports = importSpecifiers(file, source);

    if (file.includes("/client/")) {
      const crossesServerBoundary = imports.some(
        (specifier) =>
          specifier === "effect" ||
          specifier.startsWith("effect/") ||
          specifier.startsWith("#/server/") ||
          specifier.includes("/server/"),
      );

      invariant(
        !crossesServerBoundary,
        `Browser module crosses the server/Effect boundary: ${file}`,
      );
    }

    if (file.includes("/server/")) {
      const crossesClientBoundary = imports.some(
        (specifier) => specifier.startsWith("#/client/") || specifier.includes("/client/"),
      );

      invariant(!crossesClientBoundary, `Server module crosses the browser boundary: ${file}`);
    }
  }

  const clientOutput = path.resolve(root, "dist/client");
  const outputFiles = await listFiles(clientOutput);

  const bundleFiles = outputFiles.filter((file) => /\.(?:js|map)$/u.test(file));

  const bundleContents = await Promise.all(
    bundleFiles.map(async (file) => ({ file, contents: await readFile(file, "utf8") })),
  );

  for (const { contents, file } of bundleContents) {
    invariant(
      !/effect\/unstable|EffectPrimitive|~effect\//u.test(contents),
      `Browser bundle contains Effect runtime markers: ${file}`,
    );

    if (file.endsWith(".map")) {
      invariant(
        !/node_modules\/effect|\/src\/server\/|\/effect\//u.test(contents),
        `Browser sourcemap contains a server or Effect source: ${file}`,
      );
    }
  }

  return "Source imports, browser bundles, and browser sourcemaps preserve the application boundary.\n";
}

export const verification = stdout.write(await verifyBoundaries());
