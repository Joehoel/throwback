# Microsoft Graph delta scope for the Curation webapp

Status: **research complete; production choice recorded in ADR-0024** · Date: 2026-09-12 · Issue:
[Kies de synchronisatie- en clientstate-architectuur](https://github.com/Joehoel/throwback/issues/38)

## Finding

Throwback must use the documented drive-root delta endpoint for OneDrive Personal and derive the selected
root-folder subtree from an id-based hierarchy in D1. It must not make correctness depend on item-scoped
delta.

The current Microsoft Graph v1.0 reference, updated June 6, 2026, describes `driveItem: delta` as tracking
a DriveItem and its children, and several generated SDK snippets expose an item-id request builder. The
same reference's normative **HTTP request** section, however, lists only root forms such as
`GET /drives/{drive-id}/root/delta` and `GET /me/drive/root/delta`. It does not document
`/items/{item-id}/delta` as an HTTP contract. Historical reports that item-scoped delta worked for some
OneDrive Personal accounts do not turn that inconsistency into a production guarantee.

The documented root feed is sufficient. Microsoft requires delta—not a paged `children` crawl—for an
initial complete representation when concurrent writes are possible. The client follows the returned
opaque `@odata.nextLink` values until Graph returns `@odata.deltaLink`, then stores and replays that full
link. It never constructs or parses a delta token. A `410 Gone` starts a fresh enumeration from the
returned location.

Graph also documents that:

- an item may occur more than once, so the last occurrence in the complete traversal wins;
- `parentReference.path` can be absent because ancestor renames do not replay descendants;
- identity and ancestry must therefore use item ids, not paths; and
- a deleted folder is removed only after all changes have been synchronized.

## Projection consequence

D1 stores a minimal whole-drive skeleton outside the selected root folder: DriveItem id, parent id,
node kind, and tombstone state. Names, tags, projected metadata, and other Foto details are retained only
for the selected subtree. Moving an ancestor into the subtree triggers hydration of its known descendants;
moving or deleting one outside recursively removes those descendants from the active Foto projection
without deleting durable review history.

Every complete delta traversal is staged. Initial enumeration and cursor recovery publish a new projection
generation only after the final delta link. Incremental application uses per-item projection-revision CAS;
if a newer Workflow result wins during the traversal, delta skips that stale staged row and immediately
schedules a follow-up traversal.

## Primary source

- Microsoft Graph, [driveItem: delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0)
  (v1.0 reference, updated 2026-06-06).
