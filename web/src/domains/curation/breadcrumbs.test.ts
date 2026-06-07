import { describe, expect, it } from "vitest";
import type { ThrowbackEvent } from "./data";
import { buildCrumbs } from "./breadcrumbs";

/**
 * Build an event from its full folder chain (parents + leaf) — the only fields
 * `buildCrumbs` reads. Everything else gets inert defaults so a test reads as a
 * folder tree, e.g. `evt("a", "Camera-Album", "2022", "08. Augustus", "Verjaardag")`.
 */
const evt = (id: string, ...chain: string[]): ThrowbackEvent => ({
  id,
  name: chain.at(-1),
  path: chain.slice(0, -1),
  period: "",
  aiPlace: "",
  location: null,
  coords: { lat: 0, lng: 0 },
  photos: [],
});

describe("buildCrumbs", () => {
  it("renders one crumb per folder segment, with the leaf marked as current", () => {
    const active = evt("a", "Camera-Album", "2022", "08. Augustus", "Verjaardag");
    const crumbs = buildCrumbs([active], active);

    expect(crumbs.map((c) => c.label)).toEqual([
      "Camera-Album",
      "2022",
      "08. Augustus",
      "Verjaardag",
    ]);
    expect(crumbs.map((c) => c.isCurrent)).toEqual([false, false, false, true]);
  });

  it("offers the sibling folders at a level so the user can jump sideways", () => {
    const active = evt("a", "Camera-Album", "2022", "Leaf-A");
    const other = evt("b", "Camera-Album", "2021", "Leaf-B");
    const crumbs = buildCrumbs([active, other], active);

    // depth 1 = the year crumb, under the shared "Camera-Album" parent
    expect(crumbs[1].siblings.map((s) => s.label)).toEqual(["2022", "2021"]);
  });

  it("targets the first leaf event under a sibling subtree", () => {
    const active = evt("a", "Camera-Album", "2022", "Leaf");
    const first2021 = evt("b1", "Camera-Album", "2021", "Eerste");
    const second2021 = evt("b2", "Camera-Album", "2021", "Tweede");
    const crumbs = buildCrumbs([active, first2021, second2021], active);

    const to2021 = crumbs[1].siblings.find((s) => s.label === "2021");
    expect(to2021?.targetEventId).toBe("b1");
  });

  it("keeps you on the active event when re-selecting the current branch", () => {
    // active (a2) is NOT the first event under "2022"; selecting the current year must stay on a2,
    // not jump to a1 (the dedupe-first leaf under that same year).
    const first = evt("a1", "Camera-Album", "2022", "Eerste");
    const active = evt("a2", "Camera-Album", "2022", "Tweede");
    const yearCrumb = buildCrumbs([first, active], active)[1];

    expect(yearCrumb.siblings.find((s) => s.label === "2022")?.targetEventId).toBe("a2");
  });

  it("lists only same-folder siblings on the leaf crumb", () => {
    const active = evt("a", "Camera-Album", "08. Augustus", "Verjaardag");
    const sameFolder = evt("b", "Camera-Album", "08. Augustus", "Texel");
    const otherFolder = evt("c", "Camera-Album", "12. December", "Kerstmarkt");
    const crumbs = buildCrumbs([active, sameFolder, otherFolder], active);

    const leaf = crumbs.at(-1);
    expect(leaf?.siblings.map((s) => s.label)).toEqual(["Verjaardag", "Texel"]);
  });

  it("collapses a single-event tree to one self-referential crumb per level", () => {
    const active = evt("a", "Camera-Album", "2022", "Leaf");
    const crumbs = buildCrumbs([active], active);

    for (const crumb of crumbs) {
      expect(crumb.siblings).toEqual([{ label: crumb.label, targetEventId: "a" }]);
    }
  });

  it("excludes events that do not reach a given depth", () => {
    const active = evt("a", "Camera-Album", "2022", "Leaf");
    const shallow = evt("s", "Camera-Album", "2022"); // a leaf directly in the year folder, no depth-2 segment
    const leaf = buildCrumbs([active, shallow], active).at(-1);

    // at the leaf depth, the shallow event has no segment, so it is not a sibling
    expect(leaf?.siblings.map((s) => s.label)).toEqual(["Leaf"]);
  });

  it("excludes siblings that live under a different parent folder", () => {
    const active = evt("a", "Camera-Album", "2022", "08. Augustus", "Leaf");
    const crossYear = evt("o", "Camera-Album", "2021", "07. Juli", "Ander"); // a month under a *different* year
    const month = buildCrumbs([active, crossYear], active)[2];

    // "07. Juli" lives under 2021, so it must not appear among 2022's month siblings
    expect(month.siblings.map((s) => s.label)).toEqual(["08. Augustus"]);
  });

  it("preserves input order of siblings without sorting", () => {
    const active = evt("a", "Camera-Album", "2020", "L");
    const later = evt("b", "Camera-Album", "2099", "Lb");
    const earlier = evt("c", "Camera-Album", "2010", "Lc");
    const crumbs = buildCrumbs([active, later, earlier], active);

    expect(crumbs[1].siblings.map((s) => s.label)).toEqual(["2020", "2099", "2010"]);
  });
});
