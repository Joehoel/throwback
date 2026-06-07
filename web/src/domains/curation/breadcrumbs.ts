/**
 * Folder breadcrumb derivation for the photo-review prototypes.
 *
 * Turns the flat `ThrowbackEvent` list into a Windows-Explorer-style path bar:
 * one crumb per segment of the active event's folder path, each carrying the
 * sibling folders at that depth so the user can jump sideways (Explorer/Finder
 * "sideways breadcrumbs"). Pure and UI-free, so it unit-tests in node.
 */
import { Array as Arr, pipe } from "effect";
import type { ThrowbackEvent } from "./data";

/** Full folder path of an event: parent folders followed by the event's own leaf folder. */
const fullPath = (e: ThrowbackEvent): readonly string[] => [...e.path, e.name];

/** Whether the first `depth` segments of two folder paths are identical (same parent folder). */
const sharePrefix = (a: readonly string[], b: readonly string[], depth: number): boolean =>
  pipe(
    a,
    Arr.take(depth),
    Arr.every((segment, i) => segment === b[i]),
  );

export interface Crumb {
  label: string;
  isCurrent: boolean;
  /** Sibling folders at this depth — selecting one navigates to its first leaf event. */
  siblings: readonly { label: string; targetEventId: string }[];
}

/**
 * Derive the path bar for `active` from the full event list: one crumb per segment
 * of its folder path, each carrying the sibling folders at that depth. `dedupeWith`
 * keeps the first event per distinct folder name → the first leaf event below it,
 * which becomes that sibling's navigation target. Re-selecting the current branch
 * targets the active event itself (no surprise photo jump).
 */
export const buildCrumbs = (
  events: readonly ThrowbackEvent[],
  active: ThrowbackEvent,
): readonly Crumb[] => {
  const segments = fullPath(active);
  return pipe(
    segments,
    Arr.map((label, depth) => ({
      label,
      isCurrent: depth === segments.length - 1,
      siblings: pipe(
        events,
        // events that share the parent prefix and reach at least this depth
        Arr.filter((e) => {
          const fp = fullPath(e);
          return fp.length > depth && sharePrefix(segments, fp, depth);
        }),
        // one entry per distinct folder name at this depth — first match wins (= first leaf below it)
        Arr.dedupeWith((a, b) => fullPath(a)[depth] === fullPath(b)[depth]),
        Arr.map((e) => {
          const value = fullPath(e)[depth];
          return { label: value, targetEventId: value === label ? active.id : e.id };
        }),
      ),
    })),
  );
};
