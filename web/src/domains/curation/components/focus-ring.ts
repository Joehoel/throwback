/**
 * Shared focus-visible ring for custom (non-Kumo) interactive elements so
 * keyboard focus is always visible and distinct from hover/selection (WCAG 2.4.7).
 * Kumo components carry their own focus styling; this is for our bare `<button>`s.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus focus-visible:ring-offset-2 focus-visible:ring-offset-kumo-base";
