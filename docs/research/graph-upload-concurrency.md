# OneDrive Personal upload-session concurrency

**Observed:** 2026-09-11 against Microsoft Graph v1.0 and OneDrive Personal.

## Question

Does `If-Match` only guard upload-session creation, or does an upload session prevent a concurrent
content replacement from being silently overwritten at commit? The result determines which conflict
guarantees the JPEG metadata transaction may claim.

## Method

`scripts/verify_graph_upload_concurrency.py` created a temporary folder at the drive root and one
synthetic valid JPEG. It never selected or changed a Photo from the Library. The JPEG was 1,101,732
bytes and upload sessions used a first fragment of 327,680 bytes, the required 320-KiB multiple.

The probe exercised both the item's `eTag` and `cTag`:

1. Create a replacement upload session with the current tag, then cancel it.
2. Replace the file, then attempt session creation with the now-stale tag.
3. Create a session with the current tag and upload its first fragment; replace the item through the
   simple-content endpoint; then submit the session's final fragment.
4. Send simple-content replacements with a current and stale `If-Match` value.
5. Read back the final bytes, item identity, tags, and version list.

The complete temporary folder was deleted at the end (`204 No Content`). Output contains no token,
upload URL, account data, photo content, or raw drive/item identifiers.

Reproduce with:

```sh
uv run scripts/verify_graph_upload_concurrency.py
```

## Results

| Case | `eTag` | `cTag` |
|---|---:|---:|
| Create session with current tag | `200` | `200` |
| Create session with stale tag after content replacement | `412 notAllowed` | `412 notAllowed` |
| First session fragment | `202` | `202` |
| Concurrent simple-content replacement | `200` | `200` |
| Final session fragment after concurrent replacement | `404 itemNotFound` | `404 itemNotFound` |
| Simple upload with current `If-Match` | `200` | `200` |
| Simple upload with stale `If-Match` | `412 notAllowed` | `412 notAllowed` |

For both mid-session races:

- The external write changed both tags and preserved the DriveItem id.
- The external write remained the final byte content.
- The stale upload session could not overwrite it; Graph reported `The upload session was not found`.
- The item version history remained available and grew from one to eight versions over all successful
  setup, race, and simple-upload writes. The item id remained stable throughout.

## Interpretation

An upload session is **not a lock**: another writer can replace the item while a session is open. On the
observed OneDrive Personal backend, that content replacement invalidates the upload session, so its final
fragment cannot silently win. Both documented tag forms work at session creation, and stale values are
rejected before any fragment is accepted.

The simple-content endpoint also honored both forms of `If-Match` and rejected stale writes without
changing the content. Microsoft's current [small-file upload
reference](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0) does not
document that header, however. This is useful evidence, not a contract the production transaction should
depend on.

Microsoft's [upload-session
reference](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
does document `If-Match` with either an eTag or cTag at session creation. It does not promise a lock or
state what a same-item content replacement does to an already-open session; the `404` invalidation above
is observed behavior.

## Input to the JPEG transaction decision

- Create every replacement upload session with the projected current `eTag` as the stricter item-version
  precondition. Retain `cTag` to distinguish content changes and for diagnostics.
- Translate a `412` during session creation and a `404 itemNotFound` after a previously accepted fragment
  into a version conflict. Re-read the Photo and require the already-decided explicit re-evaluation.
- Never recover from either response by silently creating a new session against fresh tags: that would
  turn safe conflict detection into last-write-wins.
- Do not describe an upload session as locking a Photo. The UI and command model remain optimistic.
- After a successful commit, still retrieve the item, preserve its DriveItem id, record its new tags, and
  verify the intended embedded metadata before marking the approval command handled.
- Do not base the production guarantee on conditional simple upload unless Microsoft documents it or a
  later decision consciously accepts the observed-only behavior.

## Limits

This was one controlled run on one OneDrive Personal account. The concurrent mutation was a content
replacement—the destructive race relevant to a JPEG metadata rewrite. It did not test rename, move,
sharing changes, or metadata-only mutations while a session was open. Those operations preserve Photo
identity and can be handled by the broader pre/post-read policy if the transaction decision needs them;
this probe does not claim how they affect an upload session.
