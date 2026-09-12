import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";
import { BUILD_ID } from "../config/build-id.ts";
import { BUILD_ID_HEADER } from "./build-compatibility.ts";
import { BuildUpgradeRequired, SignInRequired, ThrowbackApi } from "./contract.ts";
import { handleDomainRequest } from "./handler.ts";

describe("Throwback domain API", () => {
  it("returns the server-confirmed bootstrap state", async () => {
    const response = await handleDomainRequest(
      new Request("https://example.test/api/domain/bootstrap", {
        headers: { [BUILD_ID_HEADER]: BUILD_ID },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(SignInRequired.make({}));
  });

  it("rejects an incompatible SPA build with a declared error", async () => {
    const response = await handleDomainRequest(
      new Request("https://example.test/api/domain/bootstrap", {
        headers: { [BUILD_ID_HEADER]: "stale-build" },
      }),
    );

    expect(response.status).toBe(409);
    const error = Schema.decodeUnknownSync(BuildUpgradeRequired)(await response.json());

    expect(error._tag).toBe("BuildUpgradeRequired");
    expect(error.currentBuildId).toBe(BUILD_ID);
    expect(error.message).toBe(
      "Deze versie van de Beheer-webapp is verouderd. Laad de pagina opnieuw.",
    );
  });

  it("publishes an OpenAPI 3.1 bootstrap contract", () => {
    const specification = OpenApi.fromApi(ThrowbackApi);

    expect(specification.openapi).toBe("3.1.0");
    expect(specification.paths["/bootstrap"]?.get?.responses["409"]?.description).toBe(
      "BuildUpgradeRequired",
    );
  });
});
