# Throwback Beheer-webapp

The web workspace contains the empty Graph-only Beheer-webapp scaffold. Browser code lives in
`src/client`, Effect and the authoritative HTTP contract live in `src/server`, and `src/routes`
contains only TanStack Start route composition.

The old local `/curate` application, prototypes, simulated data, metadata implementation, write queue,
and legacy API routes are intentionally absent.

## Local development

Install the exact dependency graph and start the real app through Alchemy:

```bash
bun install --frozen-lockfile
bun run dev
```

Alchemy serves the SPA and Worker on `http://127.0.0.1:3000`. The definitive routes are:

- `/`
- `/sign-in`
- `/setup/$step`
- `/libraries/$libraryId/events/$eventId/photos/$photoId`
- `/api/auth/$`
- `/api/domain/$`
- `/api/docs`
- `/api/openapi.json`

## Isolated preview

The preview stack is deliberately separate from production:

- hostname and Worker: `curation-preview.kuijper.fyi` / `throwback-curation-preview`;
- Access application: `Throwback Curation preview`;
- D1 database and `DB` binding: `throwback-curation-preview`;
- Better Auth secret: generated once in the preview Alchemy state;
- Microsoft callback: `https://curation-preview.kuijper.fyi/api/auth/callback/microsoft`.

Set the single curator email only for planning or deployment:

```bash
THROWBACK_BUILD_ID="$(git rev-parse HEAD)" \
  PREVIEW_ACCESS_ALLOWED_EMAIL=curator@example.com \
  bun run plan
THROWBACK_BUILD_ID="$(git rev-parse HEAD)" \
  PREVIEW_ACCESS_ALLOWED_EMAIL=curator@example.com \
  bun run deploy
```

Both commands target the explicit `preview` stage. The current scaffold does not implement Better Auth
or Microsoft OAuth yet; their isolated secret and callback boundary are reserved for the next slice.

## Verification

```bash
bun run generate
bun run build
bun run verify:boundaries
bun run verify:clean-rebuild
bun run verify:codegen
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:e2e
```

E2E starts the real application with `alchemy dev` and runs on Chromium, desktop WebKit, and iPhone
WebKit.
