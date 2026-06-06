// Smoke-verify the OneDrive outbound layer with NO network: a stub HttpClient
// Returns canned Graph responses, a stub GraphToken returns a fake token. Drives
// The real http-client pipeline (base URL, bearer, Accept, throttle retry, error
// Mapping) + the OneDriveClient ops. Run: bun scripts/verify-onedrive.ts
import { Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import type { HttpClientRequest } from 'effect/unstable/http';
import { OneDriveClient, OneDriveClientLive } from "#/domains/onedrive/client.ts";
import { GRAPH_BASE, OneDriveHttpLive } from "#/domains/onedrive/http-client.ts";
import { CurrentUser, GraphToken } from "#/domains/onedrive/token.ts";
import { makeRuntime } from "#/effect/runtime.ts";
import type { DriveItemId, UserId } from "#/domain/ids.ts";

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

// Canned Graph backend keyed by request. Captures every request the client emits.
const seen: HttpClientRequest.HttpClientRequest[] = [];
const backend = (url: URL): Response => {
  const p = url.pathname + url.search;
  // Root children, page 1 (a subfolder + a file) → nextLink to page 2
  if (p.includes("/items/root/children") && !p.includes("page2"))
    {return json({ value: [folder("sub"), file("p1")], "@odata.nextLink": `${GRAPH_BASE}/drive/items/root/children?page2=1` });}
  // Root children, page 2 (one more file, no next)
  if (p.includes("/items/root/children") && p.includes("page2")) {return json({ value: [file("p2")] });}
  // The subfolder's children (one file)
  if (p.includes("/items/sub/children")) {return json({ value: [file("p3")] });}
  // Download bytes
  if (p.includes("/items/p1/content")) {return new Response(new Uint8Array([1, 2, 3]), { status: 200 });}
  // VerifyLocation: p1 has a facet, p2 has none
  if (p.includes("/items/p1?") && p.includes("select=location")) {return json({ location: { latitude: 52.1, longitude: 5.2 } });}
  if (p.includes("/items/p2?") && p.includes("select=location")) {return json({});}
  // A throttled item — 429 with Retry-After (retried, then surfaced)
  if (p.includes("/items/throttled")) {return json({ error: "tooManyRequests" }, { status: 429, headers: { "retry-after": "3" } });}
  // A not-found item — non-transient, surfaces immediately
  if (p.includes("/items/missing")) {return json({ error: "notFound" }, { status: 404 });}
  // PATCH description target
  return new Response(null, { status: 200 });
};

const StubHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) => {
    seen.push(request);
    return Effect.succeed(HttpClientResponse.fromWeb(request, backend(url)));
  }),
);
const StubToken = Layer.succeed(GraphToken, GraphToken.of({ forUser: () => Effect.succeed("fake-token") }));
const StubUser = Layer.succeed(CurrentUser, USER);

// The client over the stub HTTP. The request-scoped auth (GraphToken + CurrentUser) is merged in so the
// methods' requirements are satisfied when run.
const ClientOnly = OneDriveClientLive.pipe(Layer.provide(OneDriveHttpLive.pipe(Layer.provide(StubHttp))));
const TestLayer = Layer.mergeAll(ClientOnly, StubToken, StubUser);

const run = <A, E>(program: Effect.Effect<A, E, OneDriveClient | GraphToken | CurrentUser>) =>
  Effect.runPromise(Effect.provide(program, TestLayer));

const out: [string, "PASS" | "FAIL", string][] = [];
const check = async (name: string, fn: () => Promise<string>) => {
  try {
    out.push([name, "PASS", await fn()]);
  } catch (error) {
    out.push([name, "FAIL", (error as Error)?.message ?? String(error)]);
  }
};

await check("crawl streams files across pages + recurses into folders", async () => {
  seen.length = 0;
  const files = await run(OneDriveClient.use((c) => Stream.runCollect(c.crawl("root" as DriveItemId))));
  const ids = files.map((f) => f.id).sort().join(",");
  if (ids !== "p1,p2,p3") {throw new Error(`expected p1,p2,p3 got ${ids}`);}
  return `ids=${ids} requests=${seen.length}`;
});

await check("base URL + bearer + accept applied to requests", async () => {
  const r = seen[0];
  const auth = r.headers.authorization;
  const {accept} = r.headers;
  if (!r.url.startsWith(GRAPH_BASE)) {throw new Error(`url not prefixed: ${r.url}`);}
  if (auth !== "Bearer fake-token") {throw new Error(`auth=${auth}`);}
  if (accept !== "application/json") {throw new Error(`accept=${accept}`);}
  return `url=${r.url.replace(GRAPH_BASE, "")} auth=${auth} accept=${accept}`;
});

await check("downloadBytes returns the canned bytes", async () => {
  const bytes = await run(OneDriveClient.use((c) => c.downloadBytes("p1" as DriveItemId)));
  const arr = [...bytes].join(",");
  if (arr !== "1,2,3") {throw new Error(`bytes=${arr}`);}
  return `bytes=[${arr}]`;
});

await check("patchDescription sends a PATCH to the item", async () => {
  seen.length = 0;
  await run(OneDriveClient.use((c) => c.patchDescription("p1" as DriveItemId, "Holiday at the lake" as never)));
  const r = seen.at(-1)!;
  if (r.method !== "PATCH") {throw new Error(`method=${r.method}`);}
  if (!r.url.includes("/items/p1")) {throw new Error(`url=${r.url}`);}
  return `${r.method} ${r.url.replace(GRAPH_BASE, "")}`;
});

await check("verifyLocation decodes a facet to Location", async () => {
  const loc = await run(OneDriveClient.use((c) => c.verifyLocation("p1" as DriveItemId)));
  if (loc === null || loc.latitude !== 52.1) {throw new Error(`loc=${JSON.stringify(loc)}`);}
  return `lat=${loc.latitude} lon=${loc.longitude}`;
});

await check("verifyLocation → null when no facet present", async () => {
  const loc = await run(OneDriveClient.use((c) => c.verifyLocation("p2" as DriveItemId)));
  if (loc !== null) {throw new Error(`expected null got ${JSON.stringify(loc)}`);}
  return "null";
});

await check("404 (non-transient) → GraphRequestError{status:404} immediately", async () => {
  const exit = await run(Effect.exit(OneDriveClient.use((c) => c.verifyLocation("missing" as DriveItemId))));
  const s = JSON.stringify(exit);
  if (!s.includes("GraphRequestError") || !s.includes("404")) {throw new Error(`exit=${s.slice(0, 200)}`);}
  return "status=404";
});

await check("429 + Retry-After → GraphRequestError{status:429,retryAfter:3} after retries", async () => {
  const exit = await run(Effect.exit(OneDriveClient.use((c) => c.verifyLocation("throttled" as DriveItemId))));
  const s = JSON.stringify(exit);
  if (!s.includes("GraphRequestError") || !s.includes("429")) {throw new Error(`exit=${s.slice(0, 200)}`);}
  if (!s.includes("\"retryAfter\":3")) {throw new Error(`retryAfter not parsed: ${s.slice(0, 200)}`);}
  return "status=429 retryAfter=3";
});

await check("makeRuntime runs a service method (lazy ManagedRuntime + Observability merge)", async () => {
  const rt = makeRuntime(TestLayer);
  const bytes = await rt.runPromise(OneDriveClient.use((c) => c.downloadBytes("p1" as DriveItemId)));
  const arr = [...bytes].join(",");
  if (arr !== "1,2,3") {
    throw new Error(`bytes=${arr}`);
  }
  return `runtime ran downloadBytes -> [${arr}]`;
});

const pass = out.filter(([, s]) => s === "PASS").length;
for (const [name, status, detail] of out) {console.log(`${status === "PASS" ? "✓" : "✗"} ${name} — ${detail}`);}
console.log(`\n${pass}/${out.length} checks passed`);
if (pass !== out.length) {process.exit(1);}
