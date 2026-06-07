import { describe, expect, it } from "@effect/vitest";
import { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";
import { buildFolderTree, findFolder } from "./folder-tree.ts";

const photo = (folderId: string, name: string): Photo => ({
  id: DriveItemId.make(`${folderId}/${name}`),
  name,
  folderId: DriveItemId.make(folderId),
  year: null,
  mimeType: "image/jpeg",
  description: null,
  location: null,
  reviewStatus: "needs_review",
});

describe("buildFolderTree", () => {
  it("builds the folder hierarchy from photo paths with recursive counts", () => {
    const tree = buildFolderTree(
      [
        photo("Root", "a.jpg"),
        photo("Root/2019", "b.jpg"),
        photo("Root/2019/sub", "c.jpg"),
        photo("Root/2020", "d.jpg"),
      ],
      "Root",
    );

    expect(tree.name).toBe("Root");
    expect(tree.photoCount).toBe(4); // recursive: all descendants
    expect(tree.photoIds).toHaveLength(1); // only the photo directly in Root

    expect(tree.children.map((child) => child.name)).toEqual(["2019", "2020"]); // sorted

    const y2019 = tree.children.find((child) => child.name === "2019");
    expect(y2019?.path).toEqual(["Root", "2019"]);
    expect(y2019?.photoCount).toBe(2); // b.jpg + sub/c.jpg
    expect(y2019?.children[0]?.name).toBe("sub");
    expect(y2019?.children[0]?.photoCount).toBe(1);
  });

  it("keeps the root even when photos live only in subfolders", () => {
    const tree = buildFolderTree([photo("Root/2021", "x.jpg")], "Root");
    expect(tree.name).toBe("Root");
    expect(tree.photoIds).toHaveLength(0);
    expect(tree.photoCount).toBe(1);
    expect(tree.children.map((child) => child.name)).toEqual(["2021"]);
  });
});

describe("findFolder", () => {
  const tree = buildFolderTree([photo("Root/2019/sub", "c.jpg")], "Root");

  it("returns the matching node by id", () => {
    expect(findFolder(tree, DriveItemId.make("Root/2019/sub"))?.name).toBe("sub");
  });

  it("returns null for an id not in the tree", () => {
    expect(findFolder(tree, DriveItemId.make("Root/nope"))).toBeNull();
  });
});
