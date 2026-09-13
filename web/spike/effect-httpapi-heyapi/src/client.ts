import * as v from "valibot";
import { client as generatedClient } from "../generated/client.gen.ts";
import type { Client } from "../generated/client/index.ts";
import {
  vDriveId,
  vDriveItemId,
  vPhotoConflict,
  vPhotoNotFound,
  vUnauthorized,
} from "../generated/valibot.gen.ts";

const DomainApiError = v.union([vUnauthorized, vPhotoNotFound, vPhotoConflict]);

export const parseDriveId = (input: unknown) => v.parse(vDriveId, input);
export const parseDriveItemId = (input: unknown) => v.parse(vDriveItemId, input);

export function addDomainErrorValidation(client: Client): Client {
  client.interceptors.error.use((error, response) => {
    if (
      response !== undefined &&
      response.status >= 400 &&
      response.status < 500 &&
      response.headers.get("content-type")?.includes("application/json") === true
    ) {
      return v.parseAsync(DomainApiError, error);
    }
    return error;
  });
  return client;
}

export const client = addDomainErrorValidation(generatedClient);
