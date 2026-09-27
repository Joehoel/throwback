import { getPhotoOptions, getPhotoPreviewOptions } from "../generated/@tanstack/react-query.gen.ts";
import type { GetPhotoData, GetPhotoPreviewData } from "../generated/types.gen.ts";
import { domainClient } from "./domain-client.ts";

/** Query the canonical active Foto projection for one parsed bookmark. */
export const photoQueryOptions = (path: GetPhotoData["path"]) =>
  getPhotoOptions({ client: domainClient, path });

/** Query authenticated JPEG bytes without applying the JSON response validator. */
export const photoPreviewQueryOptions = (path: GetPhotoPreviewData["path"]) =>
  getPhotoPreviewOptions({ client: domainClient, path });
