import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { OpenApi } from "effect/unstable/httpapi";
import { getPhotoOptions } from "../generated/@tanstack/react-query.gen.ts";
import { createClient } from "../generated/client/index.ts";
import { approvePhoto, getPhoto, getPreview } from "../generated/sdk.gen.ts";
import { ThrowbackApi } from "./contract.ts";
import { handleContractRequest } from "./handler.ts";
import {
  addDomainErrorValidation,
  client,
  parseDriveId,
  parseDriveItemId,
} from "./client.ts";
import type { DriveId, DriveItemId } from "../generated/types.gen.ts";

type AssertFalse<Value extends false> = Value;
type GeneratedIdsRemainDistinct = AssertFalse<DriveId extends DriveItemId ? true : false>;

const generatedIdsRemainDistinct: GeneratedIdsRemainDistinct = false;
assert.equal(generatedIdsRemainDistinct, false);

const driveId = parseDriveId("drive-1");
const driveItemId = parseDriveItemId("photo-1");

const specification = OpenApi.fromApi(ThrowbackApi);

assert.equal(specification.openapi, "3.1.0");
assert.deepEqual(specification.components.securitySchemes.session, {
  type: "apiKey",
  name: "throwback_session",
  in: "cookie",
});
const approvalPath = specification.paths["/drives/{driveId}/photos/{driveItemId}/approvals"];
const previewPath = specification.paths["/drives/{driveId}/photos/{driveItemId}/preview"];
assert.ok(approvalPath);
assert.ok(previewPath);
const approvalOperation = approvalPath.post;
const previewOperation = previewPath.get;
assert.ok(approvalOperation);
assert.ok(previewOperation);
assert.equal(
  approvalOperation.responses["202"]?.description,
  "ApprovalAccepted",
);
assert.deepEqual(
  previewOperation.responses["200"]?.content?.["image/jpeg"]?.schema,
  { type: "string", format: "binary" },
);

const unauthorized = await handleContractRequest(
  new Request("https://example.test/drives/drive-1/photos/photo-1?projectionRevision=1"),
);
assert.equal(unauthorized.status, 401);

client.setConfig({
  auth: "valid-session",
  baseUrl: "https://example.test",
  fetch: (input, init) => handleContractRequest(new Request(input, init)),
});

const photo = await getPhoto({
  path: { driveId, driveItemId },
  query: { projectionRevision: "1" },
});
assert.ok(photo.response);
assert.equal(photo.response.status, 200);
assert.deepEqual(photo.data, {
  driveId: "drive-1",
  driveItemId: "photo-1",
  description: null,
  location: null,
  reviewState: { _tag: "NeedsReview" },
});

const accepted = await approvePhoto({
  body: {
    description: null,
    location: { _tag: "NoLocation" },
    orientation: 6,
  },
  headers: { "idempotency-key": "attempt-1", "if-match": '\"etag-current\"' },
  path: { driveId, driveItemId },
});
assert.ok(accepted.response);
assert.equal(accepted.response.status, 202);
assert.deepEqual(accepted.data, { commandId: "command-attempt-1", status: "accepted" });

const conflict = await approvePhoto({
  body: { description: "Bij het strand", location: null, orientation: 1 },
  headers: { "idempotency-key": "attempt-2", "if-match": '\"etag-stale\"' },
  path: { driveId, driveItemId },
});
assert.ok(conflict.response);
assert.equal(conflict.response.status, 409);
assert.deepEqual(conflict.error, {
  _tag: "PhotoConflict",
  currentETag: '\"etag-current\"',
  message: "Foto base changed",
});

const preview = await getPreview({
  path: { driveId, driveItemId },
});
assert.ok(preview.response);
assert.equal(preview.response.headers.get("content-type"), "image/jpeg");
assert.ok(preview.data instanceof Blob);
assert.deepEqual(Array.from(new Uint8Array(await preview.data.arrayBuffer())), [0xff, 0xd8, 0xff, 0xd9]);

const queryClient = new QueryClient();
const queriedPhoto = await queryClient.fetchQuery(
  getPhotoOptions({
    path: { driveId, driveItemId },
    query: { projectionRevision: "2" },
  }),
);
assert.equal(queriedPhoto.driveItemId, "photo-1");

const invalidSuccessClient = createClient({
  baseUrl: "https://example.test",
  fetch: () =>
    Promise.resolve(
      Response.json({
        driveId: "drive-1",
        driveItemId: "photo-1",
        description: 42,
        location: null,
        reviewState: { _tag: "NeedsReview" },
      }),
    ),
});
await assert.rejects(
  getPhoto({
    client: invalidSuccessClient,
    path: { driveId, driveItemId },
    query: { projectionRevision: "1" },
    throwOnError: true,
  }),
);

const invalidErrorClient = createClient({
  baseUrl: "https://example.test",
  fetch: () => Promise.resolve(Response.json({ _tag: "WrongError" }, { status: 409 })),
});
addDomainErrorValidation(invalidErrorClient);
await assert.rejects(
  approvePhoto({
    body: { description: null, location: null, orientation: 1 },
    client: invalidErrorClient,
    headers: { "idempotency-key": "attempt-3", "if-match": '"etag-current"' },
    path: { driveId, driveItemId },
  }),
);

console.log(
  "Contract, SDK, success validation, binary bypass, declared errors, and query options passed.",
);
