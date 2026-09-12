# Verified conditional JPEG metadata transaction

> **Recovery detail:** ADR-0025 defines the concrete retry epochs, `failed` versus `repair_required`
> outcomes, byte-verified repair path, user actions, and privacy-safe diagnostics for this transaction.

The production Curation webapp writes an approval command's complete Description, Location, and
Orientation target through one conditional JPEG replacement in a per-Photo Cloudflare Workflow.
Embedded metadata remains canonical. A Graph item-property patch, a local File System Access write, or
an asynchronously derived Graph facet cannot independently complete the command.

## Managed target

An approval command carries an immutable full target rather than independent patches:

- Description is text or absent. Text is canonical in XMP `dc:description` and mirrored to XMP
  `dc:title`, EXIF `XPTitle`, and EXIF `XPSubject`. EXIF `ImageDescription` is removed because it is an
  unreliable legacy mirror for accented text. Absence removes all managed Description fields.
- Location is latitude and longitude or absent. It is stored in the EXIF GPS IFD. Altitude is not part of
  the curated Location: an untouched Location preserves existing altitude, while setting, replacing, or
  clearing coordinates removes it. Other unrelated GPS fields remain intact.
- Orientation is the semantic value `1` through `8`; a missing tag means `1`. UI quarter-turn actions
  compose with the current value so mirrored orientations survive. Pixels are never rotated. An
  untouched missing/upright value does not force a new tag into the file.

The application merges the current base and the Curator's Concept when it creates the command. Within
the resulting full target, absence means removal, never “leave unchanged.” If the source already has the
complete target and all mirrors are valid, the Workflow verifies and completes it without uploading.

## Preservation contract

The transform may change only the managed metadata above. JPEG scan data, ICC profiles, and unknown
JPEG APP/COM segments remain byte-identical. The EXIF thumbnail, Interop data, and every unmanaged EXIF,
GPS, and XMP property remain present and valid. Existing XMP is merged surgically rather than replaced
with a minimal packet.

The Workflow validates this contract before uploading by parsing the target and comparing a
content-free manifest of the source and output. A malformed, ambiguous, unsupported, or
offset-sensitive structure that the codec cannot preserve is a typed permanent codec failure; no bytes
are written. This intentionally rejects a Photo rather than silently dropping a thumbnail, MakerNote,
or unrelated XMP property.

The transformer is bounded in memory. It buffers JPEG metadata/header segments, computes output length,
and streams unchanged scan data into upload fragments. Full JPEGs, provider upload URLs, and embedded
metadata values are never persisted in D1, R2, Workflow logs, telemetry, or errors. A retry opens and
validates the source again.

## Transaction protocol

Each Workflow executes this saga against the command's expected DriveId, DriveItemId, cTag, eTag, and
projection revision:

1. Retrieve the Graph item and reject any cTag or eTag mismatch as a conflict.
2. Confirm that OneDrive version history is available and record the current version id plus a hash and
   preservation manifest, without metadata values.
3. Download the JPEG by item identity, without forwarding authorization to the preauthenticated content
   URL.
4. Retrieve the item again and require both tags to be unchanged across the download.
5. Parse the bytes, construct the full target, transform the managed fields, and validate both target and
   preservation invariants locally.
6. Create a replacement upload session with `If-Match` set to the current eTag and upload sequential
   fragments. The session stages fragments; another writer is not locked out.
7. Reconcile the commit, retrieve the resulting item, download its current content, and repeat target and
   preservation validation against the pre-upload manifest.
8. In one D1 transaction, store the returned tags, refresh the Photo projection, complete the command,
   and mark the Photo handled.

The OneDrive Personal probe in `docs/research/graph-upload-concurrency.md` established that current eTags
and cTags are accepted at session creation, stale values return `412`, and a concurrent content
replacement invalidates an open session: its final fragment returns `404 itemNotFound` while the
external bytes remain. Therefore both a creation-time `412` and an invalidated session after accepted
fragments are conflicts. The Workflow never silently creates a new session against fresh tags.

There is no distributed transaction between Graph and D1. Durable command state and reconciliation make
the saga converge after interruption. A timeout around the final fragment is resolved by reading the
current item and bytes: an exact target continues with verification, the exact old state may restart
under the original preconditions, and any other state conflicts.

## Verification, derived facets, and compensation

A Photo becomes handled only after the committed JPEG itself passes target and preservation validation
and the new Graph tags and D1 projection are committed. The derived Graph `location` facet and generated
thumbnails may lag. They are polled for a bounded period and may produce a warning, but cannot override
canonical embedded metadata or block `handled`.

If Graph commits content that fails post-write validation, the Workflow attempts a conditional rollback
without introducing another photo store:

1. Download the recorded previous OneDrive version and require its hash to match the original.
2. Require the current eTag still to identify this command's failed commit.
3. Re-upload the prior bytes through a new session using that eTag as `If-Match`.
4. Verify the restored bytes and leave the command failed and the Photo unhandled.

If another writer has changed the item, rollback cannot be made safe and the result is a conflict. If
the previous version is unavailable or rollback verification fails, the command requires human repair.
The direct Graph `restoreVersion` operation is not used automatically because its contract exposes no
conditional precondition and could overwrite a later writer.

## Retry and failure boundaries

- Network failures, `408`, `429`, and `5xx` responses receive bounded retries with `Retry-After` or
  exponential backoff. Accepted fragments resume through the same session where possible.
- `401` triggers one token refresh, then waits for reauthentication under ADR-0021.
- Version/precondition conflicts never retry automatically.
- Codec, preservation, malformed-JPEG, quota, unsupported-shape, and unsafe-rollback failures do not
  retry automatically.
- A permanent technical failure preserves the Concept and command. It never automatically marks the
  Photo handled or skipped; only the Curator may explicitly skip it.

The cross-system error taxonomy, retry counts, user-facing recovery controls, and observability fields
are finalized by the later error-recovery decision.

## Consequences

- ADR-0008's EXIF GPS and unchanged-pixel choice remains, but its separate Graph Description patch is
  superseded.
- ADR-0011's per-Photo Workflow remains, but now owns all managed JPEG fields and verifies canonical file
  content rather than waiting on a derived facet.
- ADR-0019's embedded-metadata canonicality remains; its local File System Access production write path
  is superseded. File System Access is a development harness only.
- The current `MetadataEdit` (`null = leave as-is`), split `WriteKind`, minimal XMP replacement, EXIF
  reserialization, thumbnail/Interop removal, and full-file binary strings are not production-safe. The
  migration must replace or contain them behind a codec that satisfies this contract.
- Availability of version history is a write precondition because it supplies rollback bytes without a
  second private-photo store.

## Status

**Accepted (2026-09-11).** This is the production write contract for JPEG metadata.
