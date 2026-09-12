import { parseAsync } from "valibot";
import { BUILD_ID } from "../config/build-id.ts";
import { client as generatedClient } from "../generated/client.gen.ts";
import type { Client } from "../generated/client/index.ts";
import { vBuildUpgradeRequiredEncoded } from "../generated/valibot.gen.ts";
import {
  MutationBlockedForUpgradeError,
  getReloadRequirement,
  markReloadRequired,
} from "./reload-required.ts";

export const BUILD_ID_HEADER = "x-throwback-build-id";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function configureDomainClient(client: Client): Client {
  client.setConfig({
    baseUrl: "/api/domain",
    credentials: "same-origin",
    headers: { [BUILD_ID_HEADER]: BUILD_ID },
  });

  client.interceptors.request.use((request) => {
    if (getReloadRequirement() !== null && !safeMethods.has(request.method)) {
      throw new MutationBlockedForUpgradeError(
        "Domain mutations are blocked until the Beheer-webapp reloads.",
      );
    }

    return request;
  });

  client.interceptors.error.use(async (error, response) => {
    if (
      response !== undefined &&
      response.status >= 400 &&
      response.status < 500 &&
      response.headers.get("content-type")?.includes("application/json") === true
    ) {
      const parsed = await parseAsync(vBuildUpgradeRequiredEncoded, error);

      markReloadRequired(parsed);

      return parsed;
    }

    return error;
  });

  return client;
}

export const domainClient = configureDomainClient(generatedClient);
