# Effect HttpApi with a generated browser contract

The production **Curation webapp** is one TanStack Start application deployed to Cloudflare Workers
through Alchemy v2. Its UI is a client-rendered SPA, while its domain HTTP API is defined by Effect
`HttpApi` on the server and consumed through an OpenAPI-generated browser client. This keeps Effect's
domain and failure model in the backend without shipping Effect to the browser.

## Application and route boundaries

TanStack Start runs with SSR disabled by default. Start still owns the application shell, request
middleware, same-origin server routes, and the single Cloudflare Worker build. A thin Start splat route
mounts the Effect handler at `/api/domain/$`.

The production route boundaries are:

- `/api/domain/$` contains every Curator-facing domain operation, including Photo reads, JPEG previews,
  Concepts, generation commands, approval commands, command status, and resume-position operations.
- `/api/auth/$` and the Microsoft OAuth callbacks remain Better Auth protocol routes outside `HttpApi`.
- `/api/openapi.json` and `/api/docs` expose the generated OpenAPI 3.1 contract and interactive
  documentation. Cloudflare Access protects them with the rest of the production host; they do not
  grant access to Curator data.
- Cloudflare Workflow entry points are bound internal infrastructure, not public HTTP operations. The
  domain API accepts commands and reports their status; it never exposes a Workflow binding or runner.

Every protected domain operation independently resolves the Better Auth session and the claimed
Curator identity. The generated browser client never receives an OAuth token, never supplies the
generated cookie-auth value, and always sends the HttpOnly session cookie through same-origin Fetch
credentials.

Alchemy `Cloudflare.Website.Vite` owns the final Worker bundle, bindings, local development, and deployment.
The Vite SSR optimizer excludes `effect` so local workerd does not create two incompatible Effect
instances. A Vite framework module is not treated as a standalone Wrangler Worker entry.

## Contract and browser boundary

Server-only Effect `Schema`, `Schema.TaggedError`, `HttpApi`, and `HttpApiGroup` definitions are the
authoritative domain HTTP contract. Groups follow cohesive domain capabilities rather than frontend
screens. The contract generates deterministic OpenAPI 3.1, which then generates:

- a bundled Fetch client and operation SDK;
- TanStack Query v5 options;
- Valibot v1 response schemas; and
- TypeScript DTOs for the browser.

Generated Valibot validators run for successful JSON responses. One handwritten client-boundary
interceptor validates every declared non-2xx domain JSON response against the generated tagged-error
schemas. A malformed or undeclared response becomes a client protocol failure; network failures and
unstructured infrastructure failures remain transport failures for the error-recovery policy. JPEG
preview responses retain their declared `image/jpeg` binary representation and bypass JSON validation.

Effect brands do not survive OpenAPI by themselves. Each wire identifier therefore carries a stable
Throwback-specific OpenAPI `format`. Supported Hey API TypeScript and Valibot resolver hooks map those
formats to matching generated Valibot brands. Browser code constructs identifiers by parsing at its
generated-client boundary; it does not use casts, maintain duplicate handwritten identifier schemas, or
import Effect.

No browser-reachable production module may import Effect at runtime or as a type. React, TanStack
Query, XState, generated DTOs, and Valibot own the browser side. Development harnesses may retain their
existing implementation only when they are excluded from the production route tree and browser chunks.

## Generation, versions, and compatibility

The OpenAPI document and complete generated browser client are committed. CI regenerates both from the
Effect contract and fails on any diff; a second generation pass must be byte-for-byte identical. Nobody
edits generated files by hand. The build order is contract to OpenAPI, OpenAPI to browser artifacts,
typecheck and drift verification, TanStack Start build, then Alchemy bundling and deployment.

Alchemy, Effect, TanStack Start/Router/Query, Vite, TypeScript, Hey API, and Valibot are exact direct
version pins. Upgrades to this chain happen deliberately in one reviewed change that regenerates and
verifies the contract artifacts.

TypeScript 7 runs every application, server, and generated-client typecheck. Hey API 0.99 still imports
the JavaScript compiler API removed from the TypeScript 7 package, so only its build-time module
specifier resolves through the official `@typescript/typescript6` compatibility package. The
`typescript-7` alias invokes the actual TS7 compiler; this is an isolated generator compatibility seam,
not a project-wide compiler downgrade.

Hey API 0.99.0's bundled Fetch runtime does not satisfy `exactOptionalPropertyTypes: true`. Until an
upstream release fixes that incompatibility, generated code has an isolated compiler boundary matching
the application's current setting; handwritten contract and integration code remains checked with
exact optional properties enabled. Diagnostics are neither suppressed nor patched out of generated
files. The generator is build-time-only and must be upgraded once its current transitive `js-yaml`
advisories have a fixed release.

The SPA and Worker deploy together and `/api/domain` has no URL version. Breaking wire changes are
allowed only in a coordinated deployment. Every domain request includes the SPA build id. If an open tab
uses an incompatible build after deployment, middleware returns a typed upgrade-required response
before executing the operation. The client stops domain mutations and enters a mandatory reload state;
hashed assets remain immutable while the HTML shell is revalidated so the reload obtains the current
bundle.

## Migration

The production cutover from oRPC and TanStack `createServerFn` is atomic rather than a long-lived dual
stack. The complete HttpApi surface, generated client, auth middleware, and parity tests are prepared
behind non-production routes. One deployment switches all integrated production call sites and routes;
the obsolete oRPC procedures and production server functions are then removed. There is no adapter in
which one transport calls the other and no period with two authoritative contracts. The local `/curate`
flow remains a development harness, not an alternative production transport.

## Consequences for existing decisions

- ADR-0010 is confirmed: Alchemy v2 remains the only infrastructure authority and produces the Worker.
- ADR-0012 remains authoritative for Effect v4 backend services, Layers, schemas, and the single server
  runtime. Its whole-app wording, Standard Schema/oRPC transport, and oRPC Query bridge are superseded by
  this server-only Effect and generated-client boundary.
- ADR-0013 remains authoritative for English code, server-side Effect brands, Schema transforms, and
  `Schema.TaggedError`. Tagged errors now cross `HttpApi`/OpenAPI rather than oRPC, and browser identifier
  brands are generated from explicit wire formats.
- ADR-0015's XState and TanStack Query responsibilities remain; only their transport actor changes to the
  generated Query client.
- ADR-0011's per-Photo Workflow boundary and ADR-0021's auth, cookie, Access, and dedicated Better Auth
  boundaries are confirmed.

## Status

**Accepted (2026-09-12).** This is the production frontend, backend, and API-contract stack for the
integrated Curation webapp.
