import { readFile, writeFile } from "node:fs/promises";
import { Schema } from "effect";

const MediaRepresentation = Schema.Struct({
  schema: Schema.Struct({ format: Schema.optionalKey(Schema.String) }),
});

const ApiResponse = Schema.Struct({
  content: Schema.optionalKey(Schema.Record(Schema.String, MediaRepresentation)),
});

const ApiOperation = Schema.Struct({
  operationId: Schema.String,
  responses: Schema.Record(Schema.String, ApiResponse),
});

const PathItem = Schema.Struct({
  get: Schema.optionalKey(ApiOperation),
  post: Schema.optionalKey(ApiOperation),
  put: Schema.optionalKey(ApiOperation),
  patch: Schema.optionalKey(ApiOperation),
  delete: Schema.optionalKey(ApiOperation),
});

const ApiDocument = Schema.Struct({
  paths: Schema.Record(Schema.String, PathItem),
});

type ApiDocument = typeof ApiDocument.Type;

function declaredBinaryOperationIds(document: ApiDocument): ReadonlySet<string> {
  const operationIds = new Set<string>();

  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem)) {
      const successMedia = Object.entries(operation.responses)
        .filter(([status]) => status.startsWith("2"))
        .flatMap(([, response]) => Object.entries(response.content ?? {}));

      const isBinaryOnly =
        successMedia.length > 0 &&
        successMedia.every(
          ([mediaType, representation]) =>
            mediaType !== "application/json" && representation.schema.format === "binary",
        );

      if (isBinaryOnly) {
        operationIds.add(operation.operationId);
      }
    }
  }

  return operationIds;
}

const openApiSource = await readFile("openapi.json", "utf8");

const openApiDocument = Schema.decodeUnknownSync(ApiDocument)(JSON.parse(openApiSource));

const binaryOperationIds = declaredBinaryOperationIds(openApiDocument);

const sdkPath = "src/client/generated/sdk.gen.ts";

const sdkSource = await readFile(sdkPath, "utf8");

const sdkLines = sdkSource.split("\n");

const removedValidators = new Set<string>();

let activeBinaryOperation = false;

const finalizedLines = sdkLines.filter((line) => {
  const operationDeclaration = /^export const (?<operationId>[A-Za-z0-9]+) =/u.exec(line);

  if (operationDeclaration?.groups?.operationId !== undefined) {
    activeBinaryOperation = binaryOperationIds.has(operationDeclaration.groups.operationId);
  }

  if (!activeBinaryOperation || !line.includes("responseValidator:")) {
    return true;
  }

  const validator = /v\.parseAsync\((?<validator>v[A-Za-z0-9]+)/u.exec(line)?.groups?.validator;

  if (validator === undefined) {
    throw new Error("Binary SDK response validator has an unexpected generated shape");
  }

  removedValidators.add(validator);

  return false;
});

if (removedValidators.size !== binaryOperationIds.size) {
  throw new Error("Every declared binary operation must bypass generated JSON response validation");
}

let finalizedSource = finalizedLines.join("\n");

for (const validator of removedValidators) {
  finalizedSource = finalizedSource.replace(new RegExp(`${validator},\\s*`, "u"), "");

  if (finalizedSource.includes(validator)) {
    throw new Error(`Binary response validator ${validator} remains in the generated SDK`);
  }
}

await writeFile(sdkPath, finalizedSource, "utf8");
