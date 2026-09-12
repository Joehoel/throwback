import { afterEach, describe, expect, it } from "vitest";
import { BUILD_ID } from "../config/build-id.ts";
import { createClient } from "../generated/client/index.ts";
import { getBootstrap } from "../generated/sdk.gen.ts";
import { vBuildUpgradeRequiredEncoded, vSignInRequired } from "../generated/valibot.gen.ts";
import { parse } from "valibot";
import { BUILD_ID_HEADER, configureDomainClient } from "./domain-client.ts";
import {
  MutationBlockedForUpgradeError,
  clearReloadRequirement,
  getReloadRequirement,
} from "./reload-required.ts";
import { handleDomainRequest } from "#/server/api/handler.ts";

afterEach(clearReloadRequirement);

describe("domain browser client", () => {
  it("uses same-origin credentials and the current build without constructing auth", async () => {
    let capturedRequest = new Request("https://example.test");

    const client = configureDomainClient(
      createClient({
        fetch: () => handleDomainRequest(capturedRequest),
      }),
    );

    client.interceptors.request.use((request) => {
      capturedRequest = request;

      return request;
    });

    client.setConfig({ baseUrl: "https://example.test/api/domain" });

    const result = await getBootstrap({ client, throwOnError: true });

    expect(result.data).toEqual(parse(vSignInRequired, JSON.parse('{"_tag":"SignInRequired"}')));
    expect(capturedRequest.credentials).toBe("same-origin");
    expect(capturedRequest.headers.get(BUILD_ID_HEADER)).toBe(BUILD_ID);
    expect([
      capturedRequest.headers.has("authorization"),
      capturedRequest.headers.has("cookie"),
    ]).toStrictEqual([false, false]);
  });

  it("validates upgrade errors and blocks later mutations before Fetch", async () => {
    let fetchCount = 0;
    let capturedRequest = new Request("https://example.test/api/domain/bootstrap");

    const client = configureDomainClient(
      createClient({
        fetch: () => {
          fetchCount += 1;

          return handleDomainRequest(capturedRequest);
        },
      }),
    );

    client.interceptors.request.use((request) => {
      capturedRequest = request;

      return request;
    });

    client.setConfig({ baseUrl: "https://example.test/api/domain" });

    await expect(
      getBootstrap({
        client,
        headers: { [BUILD_ID_HEADER]: "stale-build" },
        throwOnError: true,
      }),
    ).rejects.toEqual(
      parse(
        vBuildUpgradeRequiredEncoded,
        JSON.parse(
          `{"_tag":"BuildUpgradeRequired","currentBuildId":"${BUILD_ID}","message":"Deze versie van de Beheer-webapp is verouderd. Laad de pagina opnieuw."}`,
        ),
      ),
    );

    expect(getReloadRequirement()).toMatchObject({ currentBuildId: BUILD_ID });

    await expect(
      client.post({ throwOnError: true, url: "/mutation-that-must-not-run" }),
    ).rejects.toBeInstanceOf(MutationBlockedForUpgradeError);
    expect(fetchCount).toBe(1);
  });
});
