import { DriveItemId } from "#/domains/shared/ids.ts";
import type { Photo } from "#/domains/shared/photo.ts";

/**
 * The folder tree the curation UI navigates — replacing the prototype's
 * event-centric model with the real OneDrive/local folder hierarchy. Built purely
 * from the crawled `Photo[]` (each photo's `folderId` is its parent's POSIX path),
 * so only photo-bearing branches appear.
 */
export interface FolderNode {
  /** POSIX path of this folder ("Vakantie/2022"); the root's id is its name. */
  readonly id: DriveItemId;
  /** This folder's own segment name. */
  readonly name: string;
  /** Segments from the root (root first), inclusive of this folder. */
  readonly path: readonly string[];
  /** Immediate subfolders, sorted by name. */
  readonly children: readonly FolderNode[];
  /** Ids of photos directly in this folder (not descendants). */
  readonly photoIds: readonly DriveItemId[];
  /** Photos in this folder and all descendants. */
  readonly photoCount: number;
}

interface MutableNode {
  id: string;
  name: string;
  path: string[];
  children: Map<string, MutableNode>;
  photoIds: DriveItemId[];
}

/** Recursively freeze a mutable node into an immutable `FolderNode` with counts. */
function freezeNode(node: MutableNode): FolderNode {
  const children = [...node.children.values()]
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((child) => freezeNode(child));
  const photoCount =
    node.photoIds.length + children.reduce((sum, child) => sum + child.photoCount, 0);
  return {
    id: DriveItemId.make(node.id),
    name: node.name,
    path: node.path,
    children,
    photoIds: node.photoIds,
    photoCount,
  };
}

/**
 * Build the folder tree from crawled photos. `rootName` is the picked folder's
 * name — the first segment of every `folderId` — so a root that only holds
 * subfolders still yields a root node.
 */
export function buildFolderTree(photos: readonly Photo[], rootName: string): FolderNode {
  const root: MutableNode = {
    id: rootName,
    name: rootName,
    path: [rootName],
    children: new Map(),
    photoIds: [],
  };

  // Walk a photo's folder segments, creating any missing ancestor nodes.
  const ensure = (segments: readonly string[]): MutableNode => {
    let node = root; // segments[0] is the root name — start there, descend the rest
    for (let depth = 1; depth < segments.length; depth += 1) {
      const name = segments[depth];
      let child = node.children.get(name);
      if (child === undefined) {
        const path = segments.slice(0, depth + 1);
        child = { id: path.join("/"), name, path, children: new Map(), photoIds: [] };
        node.children.set(name, child);
      }
      node = child;
    }
    return node;
  };

  for (const photo of photos) {
    ensure(photo.folderId.split("/")).photoIds.push(photo.id);
  }

  return freezeNode(root);
}

/** Depth-first lookup of a folder by id; null when not in the tree. */
export function findFolder(root: FolderNode, id: DriveItemId): FolderNode | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const hit = findFolder(child, id);
    if (hit !== null) {
      return hit;
    }
  }
  return null;
}
