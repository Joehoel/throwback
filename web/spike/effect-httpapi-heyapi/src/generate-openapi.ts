import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { OpenApi } from "effect/unstable/httpapi";
import { ThrowbackApi } from "./contract.ts";

const outputPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
const specification = OpenApi.fromApi(ThrowbackApi);

await writeFile(outputPath, `${JSON.stringify(specification, undefined, 2)}\n`, "utf8");
