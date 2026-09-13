# shadcn/ui Base Nova on Base UI replaces Cloudflare Kumo

The Curation webapp uses the complete shadcn/ui `base-nova` component set on Base UI instead of
`@cloudflare/kumo`. The responsive Splitscreen review direction selected in ADR-0016 remains unchanged;
this decision replaces only its component-library and theming contract.

## Decision

- `web/components.json` is the source configuration: `base-nova`, Base UI, neutral colors, CSS variables,
  Lucide icons, and `rsc: false`.
- Generated component sources live in `web/src/client/components/ui/**`; generated hooks live in
  `web/src/client/hooks/**`. They are checked by TypeScript and production builds but excluded from
  repository-specific Oxlint rules so upstream-generated code remains reproducible.
- Application components compose these local sources and may add product-specific styling through the
  existing `cn()` utility and semantic CSS variables.
- Manrope remains the body font. Headings inherit it unless a future design decision introduces a
  separate display face.
- Kumo packages, configuration, imports, styles, and token names do not remain as compatibility aliases.

## Rationale

shadcn/ui keeps the component implementation in the repository, exposes the Base UI primitives directly,
and gives the application control over accessibility fixes and visual details without wrapping a second
design system. Generating the complete set now also establishes one consistent component vocabulary for
later production slices.

Keeping generated sources separate from application components preserves two useful boundaries: upstream
components can be regenerated cleanly, while Throwback-specific composition and copy remain subject to the
repository's stricter lint rules.

## Consequences

- ADR-0016 is superseded only for its Kumo choice and token-only Kumo rules. Its Splitscreen interaction and
  responsive layout decisions still apply.
- ADR-0026's client ownership boundary remains intact, with shadcn/ui replacing Kumo inside
  `src/client/**`.
- Dependency versions introduced by shadcn generation are pinned exactly. Updating the generated set is an
  explicit maintenance operation and must be followed by typecheck, build, and boundary verification.
- Product code must not edit generated files merely to satisfy repository-specific style preferences;
  adapt behavior through composition unless the change is an intentional maintained fork.

## Status

**Accepted (2026-09-13).** Kumo was removed and the complete shadcn/ui `base-nova` Base UI set was generated
for the production webapp.
