# Effect HttpApi → Hey API contract-chain spike

## Verdict

**Qualified pass.** The pinned Effect v4 contract can own a Worker-safe server router and deterministic OpenAPI 3.1 artifact. Hey API 0.99.0 generates a browser Fetch SDK, Valibot response validators, and TanStack Query v5 options that execute against that router without Effect entering the browser bundle.

The stack decision must account for two tooling constraints before adopting the chain:

1. Hey API's bundled Fetch runtime does not compile with `exactOptionalPropertyTypes: true`.
2. Vite's SSR dependency optimizer must exclude `effect` during local workerd development; otherwise two Effect module instances can make `Redacted` credentials unreadable across the HttpApi middleware boundary.

This spike does not choose Effect HttpApi over the existing oRPC path.

## Pinned matrix

| Tool | Version |
| --- | --- |
| Effect | `4.0.0-beta.78` |
| Hey API OpenAPI TypeScript | `0.99.0` |
| TanStack React Query | `5.102.8` |
| Valibot | `1.5.0` |
| TanStack Start | `1.168.24` (parent app) |
| Vite | `8.0.16` |
| Wrangler | `4.98.0` (parent app) |
| Alchemy | `2.0.0-beta.52` (parent app) |

All spike dependencies are exact-pinned in `package.json` and `package-lock.json`.

## Contract coverage

The single `ThrowbackApi` contract in `src/contract.ts` covers the representative protocol forms requested by the ticket.

| Form | Effect contract | OpenAPI / generated result |
| --- | --- | --- |
| Branded ids | `DriveId`, `DriveItemId`, `CommandId` | Custom OpenAPI formats drive generated Valibot brands and distinct TypeScript intersections |
| Nullable fields | Beschrijving and Locatie use `Schema.NullOr` | Required properties with `T | null` |
| Discriminated unions | `LocationTarget` and `reviewState` | Literal `_tag` unions remain discriminated |
| Declared errors | `Unauthorized`, `PhotoNotFound`, `PhotoConflict` | Typed `401`, `404`, and `409` response maps |
| Non-default success | Accepted Goedkeuringsopdracht | Typed `202` response |
| Cookie auth | `throwback_session` API key in cookie | OpenAPI security scheme and per-operation security metadata |
| Path input | Drive and Foto ids | Required generated `path` object |
| Query input | `projectionRevision` decoded with `FiniteFromString` | String on the wire; number in the Effect handler |
| Header input | `Idempotency-Key` and `If-Match` | Required generated `headers` object |
| JSON body | Complete `ApprovalTarget` | Required generated `body`; orientation remains `1 | … | 8` |
| JPEG response | `Uint8Array` with `image/jpeg` | OpenAPI binary string; generated browser result `Blob | File` |

`src/verify-contract.ts` sends the generated SDK and Query options through the real Effect web handler. It verifies authentication, success, conflict, not-found-capable contracts, binary response decoding, successful JSON validation, and rejected malformed success/error JSON.

## Preserved information and losses

### Preserved

- OpenAPI output is `3.1.0` and byte-for-byte deterministic across repeated generation.
- Component identifiers and custom `throwback-*-id` formats survive. Supported TypeScript and Valibot resolvers turn them into matching `Brand<...>` types, so generated ids remain nominally distinct and values can be constructed by parsing at the browser boundary without casts.
- Nullability, literal unions, error tags, status codes, media type, path/query/header/body placement, and cookie security survive the complete chain.
- A generated query option executes through `QueryClient.fetchQuery` with the expected result type.
- Generated SDK response validators reject malformed successful JSON. A single client error interceptor validates declared 4xx JSON against the generated tagged-error component schemas. JPEG binary success responses bypass JSON validation.

### Lost or intentionally boundary-specific

- Effect's nominal brand itself has no OpenAPI equivalent. The working bridge deliberately annotates id strings with custom OpenAPI formats and maintains small TypeScript/Valibot resolver hooks in the generator configuration. This is generator coupling, but it avoids Effect imports, post-generation edits, casts, and separately maintained frontend id schemas.
- `FiniteFromString` correctly documents its wire encoding as `string`; the generated browser client therefore does not know that the Effect handler receives a number after decoding.
- Hey API's SDK validator only runs for successful JSON. It does not validate parsed non-2xx bodies even though Valibot component schemas are generated for the declared errors; the central interceptor is therefore required to complete the selected error-validation policy.
- The generated cookie security helper can append a `Cookie` header when an `auth` value is supplied. Browser code must not do that for the HttpOnly Better Auth cookie. Keep the API same-origin, omit generated `auth`, and use explicit `credentials: "same-origin"`; the browser then owns cookie transmission.

## Tooling constraints

### Exact optional properties

Hey API's default `bundle: true` copies its Fetch runtime source into `generated/client` and `generated/core`. With `exactOptionalPropertyTypes: true`, TypeScript 6.0.2 reports `TS2375`/`TS2379` in that generated runtime. `src/verify-strict-codegen.mjs` makes this a reproducible expected finding.

The current `web/tsconfig.json` does not enable `exactOptionalPropertyTypes`, so the generated output typechecks without edits under the application's current settings. The hand-written contract and handler are checked with exact optional properties enabled, while a separate strict generated-code check proves and records the incompatibility.

`bundle: false` is not a current escape hatch: OpenAPI TypeScript 0.99.0 generates imports for newer runtime symbols such as `ClientMeta`, while the latest separately published, now-deprecated `@hey-api/client-fetch@0.13.1` does not export them.

Related upstream issues remain open:

- [Support `exactOptionalPropertyTypes` in tsconfig `compilerOptions`](https://github.com/hey-api/hey-api/issues/2236)
- [Generated code doesn't comply with TypeScript option `exactOptionalPropertyTypes: true`](https://github.com/hey-api/hey-api/issues/2363)

Do not patch generated files or suppress diagnostics. Re-evaluate the upstream fix before enabling exact optional properties for the generated-source boundary.

### Effect identity in Vite workerd development

Without an SSR optimizer exclusion, the local Cloudflare Vite plugin prebundled Effect into more than one module instance. HttpApi created a `Redacted` credential in one instance and the middleware attempted to unwrap it through another instance's private `WeakMap`, producing `Unable to get redacted value` and HTTP 500.

The verified workerd config uses:

```ts
environments: {
  ssr: {
    optimizeDeps: { exclude: ["effect"] },
  },
}
```

This is required configuration if the stack decision adopts HttpApi. It belongs in the real Vite config so Alchemy's injected Cloudflare plugin receives it too.

### Generator advisory scope

`npm audit --omit=dev` reports no runtime vulnerabilities. The 0.99.0 generator's development dependency tree currently reports high-severity `js-yaml` denial-of-service advisories. This spike consumes a repository-owned JSON artifact, not untrusted YAML, but the implementation decision should still track the advisory or a fixed release before promoting the generator into CI.

## TanStack Start and Cloudflare mount

- `web/src/routes/prototypes/httpapi/$.ts` is the thin inbound adapter. It strips only the prototype mount prefix and delegates the `Request` to Effect's `HttpRouter.toWebHandler` output.
- `web/src/routes/prototypes/httpapi-client.tsx` has `ssr: false` and imports only generated Fetch and Query artifacts.
- The parent app production build succeeds and its `httpapi-client` browser chunk contains no Effect runtime markers.
- The standalone unminified proof bundle, including Valibot and error validation, is 35,673 bytes / 9.20 kB gzip and its source map contains no `effect` sources.
- `vite.workerd.config.ts` injects the same underlying Cloudflare Vite plugin used by `Cloudflare.Vite`, without provisioning infrastructure. `src/verify-workerd.mjs` proves the SPA shell and mounted authenticated API in local workerd.
- Direct `wrangler dev dist/server/server.js` is invalid: the normal Vite output is a framework server module with external imports, not the final Worker entry. Alchemy's Cloudflare Vite build/plugin must continue to own Worker bundling and bindings.

The intended `alchemy dev` smoke could not run because the local Cloudflare OAuth refresh had expired and requested `alchemy login`. This does not block the local workerd proof, but an authenticated Alchemy smoke remains an integration check before implementation release.

## Build order

The dependency order is strict:

1. Generate `openapi.json` from the pinned server-only Effect contract.
2. Generate the Fetch SDK and TanStack Query options from that artifact.
3. Typecheck the hand-written contract and the generated boundary; check generated-file drift.
4. Build the TanStack Start browser/server application.
5. Let `Cloudflare.Vite` produce and run/deploy the final Worker artifact.

The deterministic OpenAPI and generated files may be committed for review, but generation must still run before typecheck/build and CI must fail on drift. Never import `contract.ts`, Effect, or server handlers from browser code.

## Minimal oRPC comparison

The existing oRPC route already mounts cleanly under TanStack Start and gives direct TypeScript inference plus Query utilities without code generation. Its current client imports the router type and uses an isomorphic server/client branch. The Effect/Hey chain instead creates an explicit OpenAPI boundary and prevents server contract code from entering the frontend, at the cost of build ordering and the documented generator losses. The downstream stack ticket must weigh those trade-offs; this spike does not select either path.

## Reproduction

From this directory:

```sh
npm install --ignore-scripts
npm run verify
npm run verify:workerd
```

From `web/`:

```sh
bun run typecheck
bun run lint
bun run build
```
