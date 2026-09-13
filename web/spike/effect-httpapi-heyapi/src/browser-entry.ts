import { getPhotoOptions } from "../generated/@tanstack/react-query.gen.ts";
import { client, parseDriveId, parseDriveItemId } from "./client.ts";

client.setConfig({
  baseUrl: "https://example.test/prototypes/httpapi",
  credentials: "same-origin",
});

/** Representative generated query options included in the browser-only proof bundle. */
export const photoQueryOptions = getPhotoOptions({
  path: {
    driveId: parseDriveId("drive-1"),
    driveItemId: parseDriveItemId("photo-1"),
  },
  query: { projectionRevision: "1" },
});
