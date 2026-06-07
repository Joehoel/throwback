import { describe, expect, it, layer } from "@effect/vitest";
import { Effect, Fiber, Layer, Stream } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import type { HttpClientRequest } from "effect/unstable/http";
import type { GraphRequestError } from "#/domains/shared/errors.ts";
import type { DriveItemId, UserId } from "#/domains/shared/ids.ts";
import { makeRuntime } from "#/effect/runtime.ts";
import { OneDriveClient, OneDriveClientLive } from "#/domains/onedrive/client.ts";
import { GRAPH_BASE, OneDriveHttpLive } from "#/domains/onedrive/http-client.ts";
import { CurrentUser, GraphToken } from "#/domains/onedrive/token.ts";

/**
 * OneDrive outbound layer — migrated from the former `scripts/verify-onedrive.ts`.
 * No network: a stub `HttpClient` returns canned Graph responses and a stub
 * `GraphToken` returns a fake token. The tests drive the *real* http-client
 * pipeline (base URL, bearer, Accept, throttle retry, error mapping) + the
 * `OneDriveClient` ops (ADR-0004/0002/0011). The 429 case exercises the retry
 * schedule under `TestClock`, so it asserts instantly instead of sleeping ~7.5s.
 */

const USER = "user-1" as UserId;

const item = (over: Record<string, unknown>) => ({
  name: "x",
  lastModifiedDateTime: "2019-06-01T10:00:00Z",
  parentReference: { id: "f1", path: "/drive/root:/2019/06" },
  ...over,
});
const file = (id: string) => item({ id, name: `${id}.jpg`, file: { mimeType: "image/jpeg" } });
const folder = (id: string) => item({ id, folder: { childCount: 1 } });
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

// Canned Graph backend keyed by request URL. Every issued request is captured in `seen`.
const seen: HttpClientRequest.HttpClientRequest[] = [];
const backend = (url: URL): Response => {
  const p = url.pathname + url.search;
  // Root children page 1 (a subfolder + a file) → nextLink to page 2.
  if (p.includes("/items/root/children") && !p.includes("page2"))
    return json({
      value: [folder("sub"), file("p1")],
      "@odata.nextLink": `${GRAPH_BASE}/drive/items/root/children?page2=1`,
    });
  // Root children page 2 (one more file, no next).
  if (p.includes("/items/root/children") && p.includes("page2"))
    return json({ value: [file("p2")] });
  // The subfolder's children (one file).
  if (p.includes("/items/sub/children")) return json({ value: [file("p3")] });
  // Download bytes.
  if (p.includes("/items/p1/content"))
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  // verifyLocation: p1 has a facet, p2 has none.
  if (p.includes("/items/p1?") && p.includes("select=location"))
    return json({ location: { latitude: 52.1, longitude: 5.2 } });
  if (p.includes("/items/p2?") && p.includes("select=location")) return json({});
  // A throttled item — 429 with Retry-After (retried, then surfaced).
  if (p.includes("/items/throttled"))
    return json({ error: "tooManyRequests" }, { status: 429, headers: { "retry-after": "3" } });
  // A not-found item — non-transient, surfaces immediately.
  if (p.includes("/items/missing")) return json({ error: "notFound" }, { status: 404 });
  // PATCH description target.
  return new Response(null, { status: 200 });
};

const StubHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) => {
    seen.push(request);
    return Effect.succeed(HttpClientResponse.fromWeb(request, backend(url)));
  }),
);
const StubToken = Layer.succeed(
  GraphToken,
  GraphToken.of({ forUser: () => Effect.succeed("fake-token") }),
);
const StubUser = Layer.succeed(CurrentUser, USER);

// The client over the stub HTTP; the request-scoped auth is merged in so the methods' requirements resolve.
const ClientOnly = OneDriveClientLive.pipe(
  Layer.provide(OneDriveHttpLive.pipe(Layer.provide(StubHttp))),
);
const TestLayer = Layer.mergeAll(ClientOnly, StubToken, StubUser);

layer(TestLayer)("OneDriveClient", (it) => {
  it.effect("crawl streams files across pages and recurses into folders", () =>
    Effect.gen(function* () {
      seen.length = 0;
      const files = yield* OneDriveClient.use((c) =>
        Stream.runCollect(c.crawl("root" as DriveItemId)),
      );
      const ids = [...files]
        .map((f) => f.id)
        .sort()
        .join(",");
      expect(ids).toBe("p1,p2,p3");
    }),
  );

  it.effect("applies base URL + bearer + accept to every request", () =>
    Effect.gen(function* () {
      seen.length = 0;
      yield* OneDriveClient.use((c) => Stream.runCollect(c.crawl("root" as DriveItemId)));
      const r = seen[0];
      expect(r.url.startsWith(GRAPH_BASE)).toBe(true);
      expect(r.headers.authorization).toBe("Bearer fake-token");
      expect(r.headers.accept).toBe("application/json");
    }),
  );

  it.effect("downloadBytes returns the canned bytes", () =>
    Effect.gen(function* () {
      const bytes = yield* OneDriveClient.use((c) => c.downloadBytes("p1" as DriveItemId));
      expect([...bytes]).toEqual([1, 2, 3]);
    }),
  );

  it.effect("patchDescription sends a PATCH to the item", () =>
    Effect.gen(function* () {
      seen.length = 0;
      yield* OneDriveClient.use((c) =>
        c.patchDescription("p1" as DriveItemId, "Holiday at the lake"),
      );
      const r = seen.at(-1)!;
      expect(r.method).toBe("PATCH");
      expect(r.url.includes("/items/p1")).toBe(true);
    }),
  );

  it.effect("verifyLocation decodes a facet to a Location", () =>
    Effect.gen(function* () {
      const loc = yield* OneDriveClient.use((c) => c.verifyLocation("p1" as DriveItemId));
      expect(loc?.latitude).toBe(52.1);
      expect(loc?.longitude).toBe(5.2);
    }),
  );

  it.effect("verifyLocation yields null when no facet is present", () =>
    Effect.gen(function* () {
      const loc = yield* OneDriveClient.use((c) => c.verifyLocation("p2" as DriveItemId));
      expect(loc).toBeNull();
    }),
  );

  it.effect("a 404 (non-transient) surfaces GraphRequestError{status:404} immediately", () =>
    Effect.gen(function* () {
      const err = yield* Effect.flip(
        OneDriveClient.use((c) => c.verifyLocation("missing" as DriveItemId)),
      );
      if (err._tag !== "GraphRequestError") throw new Error(`unexpected error ${err._tag}`);
      expect(err.status).toBe(404);
    }),
  );

  it.effect("a 429 + Retry-After is retried then surfaces GraphRequestError{429, retryAfter}", () =>
    Effect.gen(function* () {
      // Fork so we can fast-forward the retry schedule's backoff sleeps via TestClock.
      const fiber = yield* Effect.forkChild(
        Effect.flip(OneDriveClient.use((c) => c.verifyLocation("throttled" as DriveItemId))),
      );
      yield* TestClock.adjust("1 minute");
      const err: GraphRequestError | { readonly _tag: string } = yield* Fiber.join(fiber);
      if (err._tag !== "GraphRequestError") throw new Error(`unexpected error ${err._tag}`);
      expect(err.status).toBe(429);
      expect(err.retryAfter).toBe(3);
    }),
  );
});

describe("makeRuntime", () => {
  it("runs a service method through a lazy ManagedRuntime (Observability merged)", async () => {
    const rt = makeRuntime(TestLayer);
    const bytes = await rt.runPromise(
      OneDriveClient.use((c) => c.downloadBytes("p1" as DriveItemId)),
    );
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});
