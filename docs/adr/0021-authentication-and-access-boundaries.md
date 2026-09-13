# Authentication and access boundaries for the Curation webapp

> **Recovery detail:** ADR-0025 defines the concrete one-refresh transition, retry copy, diagnostics, and
> safe resumption behavior for `waiting_for_reauthentication`.

The production **Curation webapp** uses two independent gates. Cloudflare Access protects the entire
production hostname with a single-email allowlist. Inside that edge gate, Better Auth signs the
**Curator** in with a personal Microsoft account and maintains the application session. Passing
Cloudflare Access never grants application permissions: every protected application request must still
resolve an authorized Better Auth session.

## Curator identity

An unclaimed installation offers a one-time, explicit claim after both gates have been passed. The
candidate confirms the displayed Microsoft account before D1 atomically records its stable provider
identity (`microsoft` plus the provider account id). All later requests must resolve to that identity.
Email addresses may select the Cloudflare Access audience or be displayed to the human, but are never
used as durable application identity or authorization evidence.

Only the same Microsoft account may repair an expired or revoked Graph connection. Replacing the
Curator or moving to another Microsoft account is a separate administrative reset followed by a new
Library selection and index rebuild, not an account-switch action in the webapp.

## Graph grant and application boundary

The Microsoft connection uses delegated `Files.ReadWrite`, with `offline_access` so accepted work can
continue after the browser closes. The identity flow also requests the provider's required identity
scopes and profile permission (`openid`, `profile`, `email`, and `User.Read`). It does not request
`Files.ReadWrite.All`.

`Files.ReadWrite` technically covers the signed-in account's OneDrive. The narrower product boundary is
therefore enforced by the application: browsing before initial selection is limited to choosing a
**root folder**; normal reads, previews, commands, and writes only accept items proven to belong to the
selected root-folder subtree. A client-supplied drive or item id is never sufficient authorization.

## Sessions and token custody

- Cloudflare Access and Better Auth sessions both last 30 days on the Curator's personal devices. The
  Better Auth session may roll forward while active.
- The Better Auth session uses a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. OAuth tokens are never
  exposed to browser JavaScript or stored in browser storage.
- Better Auth encrypts Microsoft access and refresh tokens before storing them in D1. Backend services
  and Workflows obtain a current token just in time; a Workflow does not depend on a live browser or
  application session.
- The same-origin API validates the Better Auth session and Curator identity independently of the
  Cloudflare Access cookie. Mutating routes retain normal origin and CSRF protections.

The Cloudflare Access application covers the SPA, Better Auth routes and callbacks, API routes,
previews, and API documentation. There are no public application routes. Bound Workflows execute
internally and do not traverse Access.

## Logout, revocation, and recovery

The UI distinguishes these actions and outcomes:

1. **Sign out on this device** revokes only the current Better Auth session.
2. **Sign out all devices** revokes every Better Auth session for the Curator.
3. **Sign out of Cloudflare Access** is a separate action for a shared or lost device; an Access session
   alone still grants no application access.
4. **Disconnect OneDrive** removes the locally held Graph credentials and blocks background Graph work.
   Revoking the application's grant at Microsoft has the same effective result once token refresh fails.

Signing out does not cancel an accepted **approval command**: it represents durable human intent and
may finish without an interactive session. If Graph credentials stop working, affected commands enter a
`waiting_for_reauthentication` condition instead of retrying indefinitely. Drafts, resume position, and
commands remain intact. After the same Microsoft account reconnects, each Photo is freshly validated
against Graph. An unchanged command resumes automatically; a version conflict requires explicit human
re-evaluation under the existing conflict policy.

## Consequences

- Cloudflare Access is defense in depth, not an identity bridge into the domain model.
- The one-time claim must be transactional and fail closed once an owner exists.
- Better Auth's generated user id may locate token records and sessions, but durable authorization is
  anchored to the recorded Microsoft provider identity.
- D1 contains security-sensitive OAuth material and must not be treated as wholly rebuildable; auth and
  owner records require backup/migration care even though the Photo projection can be rebuilt.
- Authentication loss is a recoverable command state. Its exact retry and operator presentation belongs
  to the later error-recovery decision.

## Status

**Accepted (2026-09-11).** Resolves the authentication boundary for the integrated Curation webapp and
elaborates ADR-0011's sessionless token retrieval for Workflows.
