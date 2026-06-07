# Curation webapp — domain model in `effect/Schema`

> **Status:** design (2026-06-06), build not yet started. A *design artifact*: ready to lift into
> `src/domain/` once the Alchemy session installs deps (ADR-0010 owns `package.json`). Nothing compiles
> here yet (deps not installed).
>
> Grounds on `docs/CONTEXT.md` (language) and ADR-0002/0008/0009/0011/0012/0013.
>
> **API surface — ported to verified Effect v4 (smol).** The P0 spike ran (2026-06-06,
> `effect@4.0.0-beta.78`); every pattern below is verified in `web/spike/standard-schema/`
> (`check3.mjs`, `check4.mjs`) and mapped in its `FINDINGS.md`. ADR-0012 verify-at-build #1 (Standard
> Schema export for oRPC, via `Schema.toStandardSchemaV1()`) is ✅ GREEN. One spot to confirm when
> lifting: `optionalKey` wrapping a `decodeTo` transform for *absent* Graph keys (§3) — flagged inline.

## Scope

Only the **Curation webapp** (CONTEXT.md: *Beheer-webapp*). The **TV app** (*Fotoshow*) shares the
**Library** but not this code (ADR-0009: deliberately decoupled, its own D1 index).

## Glossary — ubiquitous language ↔ code

CONTEXT.md is written in Dutch; the code is English. This table keeps traceability.

| Dutch (CONTEXT.md) | English (code) |
|--------------------|----------------|
| Bibliotheek        | Library        |
| Hoofdmap           | root folder    |
| Gebeurtenis        | `Event`        |
| Foto               | `Photo`        |
| Beschrijving       | `Description`  |
| Suggestie          | `Suggestion`   |
| Locatie            | `Location`     |
| Onderschrift       | caption *(Fotoshow only — not modelled here)* |
| Kop                | *(Fotoshow only — not modelled here)* |
| Beheer-webapp      | Curation webapp |

## Design rules (ADR-0012/0013 + verified v4)

1. **`effect/Schema` is the only contract source.** Every schema yields the **Standard Schema v1**
   (`~standard`) shape for oRPC via `Schema.toStandardSchemaV1(s)`, doubles as the domain type, and (where
   relevant) as the D1 row codec via `@effect/sql-d1`. One schema, three consumers. → `@orpc/zod` drops.
2. **Everything is English** — code, identifiers, comments, docs. Dutch domain terms appear only in the
   glossary and the odd `// ~Term` aside.
3. **Anything that resembles an identifier is a branded type** (`Schema.brand`).
4. **Errors = `Schema.TaggedErrorClass`** — schema-based (serializable over oRPC), still a real `Error`
   with a `_tag` for `Effect.catchTag` (ADR-0013; supersedes ADR-0012's literal `Data.TaggedError`).
5. **Mappers live in `Schema.decodeTo` + `SchemaTransformation`/`SchemaGetter`**, never as standalone
   helper functions (ADR-0013). One-way ingest = `decodeTo` with a `SchemaGetter.forbidden` encode.
6. **No drizzle.** App tables go through `@effect/sql-d1`; **better-auth uses its built-in native D1
   support** — pass `env.DB` straight to `database` (no drizzle, no external `kysely-d1`; verified spike
   #2 Part D). Both hit the same `env.DB`. `zod` stays only because better-auth depends on it.

> **"Missing" is `null`, not an absent key.** Domain fields that can be missing (Description, Location,
> year) are `Schema.NullOr(...)` — `null` = missing. This maps 1:1 to nullable D1 columns and matches the
> review-queue predicate (`WHERE description IS NULL`). Graph *omits* keys (`optionalKey`); the ingest
> projection turns absent/empty into `null`.

---

## 1. Identifiers (branded)

```ts
import { Schema } from "effect"

// OneDrive driveItem id — the stable key for both Photo and Event folder
export const DriveItemId = Schema.String.pipe(Schema.brand("DriveItemId"))
export type DriveItemId = typeof DriveItemId.Type

// better-auth user id — the non-secret param the Workflow receives (ADR-0011)
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

// Cloudflare Workflow instance id — for instance.status() polling (ADR-0011)
export const WorkflowInstanceId = Schema.String.pipe(Schema.brand("WorkflowInstanceId"))
export type WorkflowInstanceId = typeof WorkflowInstanceId.Type
```

---

## 2. Core schemas

### Location (ADR-0008)

GPS from the **EXIF GPS-IFD**, read **only** via the derived Graph `location` facet — never raw EXIF.
Default at **Event** level, override per **Photo**.

```ts
export const Location = Schema.Struct({          // ~Locatie
  latitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -90, maximum: 90 }))),
  longitude: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -180, maximum: 180 }))),
  altitude: Schema.optionalKey(Schema.Number),
})
export type Location = typeof Location.Type
```

### Description & Suggestion (ADR-0002, ADR-0012)

The **Description** is "his text": nothing lands without approval. An AI **Suggestion** is a *separate*
shape — only after approval does it become a Description write.

```ts
export const Description = Schema.NonEmptyString // driveItem.description

// AI suggestion, not yet approved — distinct concept from Description (approved), same shape.
// The model that produced it (gemini-2.5-flash) is a config/telemetry concern (effect/Config,
// ADR-0012), NOT part of the domain value.
export const Suggestion = Schema.NonEmptyString
export type Suggestion = typeof Suggestion.Type
```

### Review status (ADR-0009)

Per photo: what's still missing and whether dad has handled or skipped it — survives sessions.

```ts
export const ReviewStatus = Schema.Literals([
  "needs_review", // missing Description and/or Location
  "handled",      // write approved / executed
  "skipped",      // deliberately skipped
])
export type ReviewStatus = typeof ReviewStatus.Type
```

### Photo

The index projection of a driveItem as the webapp curates it.

```ts
export const Photo = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,                  // file name
  folderId: DriveItemId,                // the Event folder (ADR-0009: "map")
  year: Schema.NullOr(Schema.Int),      // from the year folder (path-only); null = "year unknown"
  mimeType: Schema.String,              // location/orientation write is JPEG-only (ADR-0008/0011)
  description: Schema.NullOr(Description), // null = no Description yet — drives the review queue
  location: Schema.NullOr(Location),    // null = no Location yet (~34% present, docs/research/gps-coverage.md)
  reviewStatus: ReviewStatus,
})
export type Photo = typeof Photo.Type
```

> No `hasDescription`/`hasLocation` booleans: a flag derived from "is the field set?" is redundant state.
> The nullable field *is* the presence — "missing" is `description === null` / `location === null`.

### Event (CONTEXT.md)

The deepest folder; the folder name is the title. Carries the **default Location** for its photos.

```ts
export const Event = Schema.Struct({    // ~Gebeurtenis
  id: DriveItemId,
  name: Schema.String,                  // folder name = title
  year: Schema.Int,
  defaultLocation: Schema.NullOr(Location), // one point for the whole folder; per-Photo override allowed
})
export type Event = typeof Event.Type
```

> **Caption (Onderschrift) / Kop are not modelled here** — composing the caption is a **Fotoshow (TV
> app)** rendering concern, not the Curation webapp's. See `CONTEXT.md` for those terms.

---

## 3. Graph ingest (the crawl source)

The children-crawl of the **root folder** yields raw Graph driveItems. One schema decodes the subset we
need (Graph *omits* keys, so they are `optionalKey`); a projection maps it onto `Photo`.

```ts
const GraphLocationFacet = Schema.Struct({
  latitude: Schema.optionalKey(Schema.Number),
  longitude: Schema.optionalKey(Schema.Number),
  altitude: Schema.optionalKey(Schema.Number),
})

export const GraphDriveItem = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),    // -> Description (ADR-0002)
  lastModifiedDateTime: Schema.DateTimeUtcFromString, // ISO 8601 -> DateTime.Utc; re-upload bumps it (ADR-0011)
  parentReference: Schema.Struct({
    id: DriveItemId,
    path: Schema.String,                              // source for the year-folder derivation
  }),
  file: Schema.optionalKey(Schema.Struct({ mimeType: Schema.String })),
  folder: Schema.optionalKey(Schema.Struct({ childCount: Schema.Number })),
  location: Schema.optionalKey(GraphLocationFacet),   // derived GPS facet — never read raw EXIF
})
export type GraphDriveItem = typeof GraphDriveItem.Type
```

### `PhotoFromGraphItem` — the ingest projection

Value logic lives in **named v4 mappers** (`decodeTo` + `SchemaTransformation`), not an imperative body
(rule #5). Key renames use struct-level `Schema.encodeKeys`. The only structural step is flattening
Graph's nested `parentReference`/`file` into the flat `Photo`; ingest is **decode-only**
(`SchemaGetter.forbidden` encode).

```ts
import { Schema, SchemaTransformation, SchemaGetter } from "effect"

// Graph description (optional, possibly "") -> Description | null  ("" or absent = null)
const DescriptionFromGraph = Schema.UndefinedOr(Schema.String).pipe(
  Schema.decodeTo(Schema.NullOr(Description), SchemaTransformation.transform({
    decode: (s) => (s ? s : null),
    encode: (d) => d ?? undefined,
  })),
)

// Graph location facet -> Location | null (only when both lat & lon present)
const LocationFromFacet = Schema.UndefinedOr(GraphLocationFacet).pipe(
  Schema.decodeTo(Schema.NullOr(Location), SchemaTransformation.transform({
    decode: (f) =>
      f?.latitude != null && f.longitude != null
        ? { latitude: f.latitude, longitude: f.longitude, ...(f.altitude != null ? { altitude: f.altitude } : {}) }
        : null,
    encode: (l) => l ?? undefined,
  })),
)

// shallowest YYYY folder segment of a OneDrive path -> Int | null  (null = "year unknown")
const YearFromPath = Schema.String.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Int), SchemaTransformation.transform({
    decode: (path) => {
      const seg = path.split("/").find((s) => /^(19|20)\d{2}$/.test(s))
      return seg ? Number(seg) : null
    },
    encode: () => "",
  })),
)

const PhotoSource = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  description: Schema.optionalKey(DescriptionFromGraph), // absent Graph key -> coerced to null below
  location: Schema.optionalKey(LocationFromFacet),
  // nested in Graph; encodeKeys renames id->folderId, path->year (path is decoded by YearFromPath)
  parentReference: Schema.Struct({
    folderId: DriveItemId,
    year: YearFromPath,
  }).pipe(Schema.encodeKeys({ folderId: "id", year: "path" })),
  file: Schema.optionalKey(Schema.Struct({ mimeType: Schema.String })),
})

export const PhotoFromGraphItem = PhotoSource.pipe(
  Schema.decodeTo(Photo, {
    decode: SchemaGetter.transform(({ parentReference, file, ...rest }) => ({
      ...rest,
      description: rest.description ?? null,
      location: rest.location ?? null,
      folderId: parentReference.folderId,
      year: parentReference.year,
      mimeType: file?.mimeType ?? "application/octet-stream",
      reviewStatus: "needs_review",
    })),
    encode: SchemaGetter.forbidden(() => "Graph ingest is decode-only"),
  }),
)
```

> **Behaviour change:** the EXIF-`takenDateTime` year fallback is dropped — `year` is path-only. EXIF
> dates are unreliable for scans (CONTEXT.md) and `year` is nullable, so "unknown" (`null`) is fine. This
> frees `year` from a cross-field dependency. (The Fotoshow can apply an EXIF fallback at Kop-render time.)
> **Confirm when lifting:** the `optionalKey(decodeTo(...))` combo for absent `description`/`location`
> Graph keys (the rest of the projection — flatten, `encodeKeys`, forbidden encode — is verified in
> `web/spike/standard-schema/check4.mjs`).

---

## 4. D1 photo index ↔ domain (ADR-0009)

Table `photo_index`, filled by the crawl, queried per session. Codec via `@effect/sql-d1`. The row is
flat, so the codec is a **pure `Schema.Struct`**: `Schema.NullOr` maps each nullable column 1:1,
`Schema.fromJsonString` decodes the `location` JSON, and struct-level `Schema.encodeKeys` does the
snake_case↔camelCase renames. No wrapping transform, no imperative body (rule #5). Bidirectional: read
*and* write. Presence is just `NULL`-ness — no boolean columns. *(Verified: `check4.mjs`.)*

| column          | type        | domain             | notes                              |
|-----------------|-------------|--------------------|------------------------------------|
| `id`            | TEXT PK     | `Photo.id`         | driveItem.id                       |
| `folder_id`     | TEXT        | `Photo.folderId`   | parentReference.id                 |
| `name`          | TEXT        | `Photo.name`       | driveItem.name                     |
| `year`          | INTEGER NULL | `Photo.year`      | NULL = unknown                     |
| `mime_type`     | TEXT        | `Photo.mimeType`   | file.mimeType                      |
| `description`   | TEXT NULL   | `Photo.description`| NULL = missing (drives the queue)  |
| `location`      | TEXT NULL   | `Photo.location`   | JSON-encoded `Location`; NULL = missing |
| `review_status` | TEXT        | `Photo.reviewStatus` | app, default `needs_review`      |

> "Missing a description" = `WHERE description IS NULL`; same for `location` — no derived flag column.

```ts
// Flat row <-> flat Photo. NullOr ↔ nullable column 1:1; fromJsonString for the location JSON column;
// encodeKeys for the snake_case renames. No wrapping transform.
export const PhotoFromRow = Schema.Struct({
  id: DriveItemId,
  name: Schema.String,
  year: Schema.NullOr(Schema.Int),
  description: Schema.NullOr(Description),
  location: Schema.NullOr(Schema.fromJsonString(Location)),
  folderId: DriveItemId,
  mimeType: Schema.String,
  reviewStatus: ReviewStatus,
}).pipe(Schema.encodeKeys({
  folderId: "folder_id",
  mimeType: "mime_type",
  reviewStatus: "review_status",
}))
```

> **Trade-off vs ADR-0009:** that ADR specced a *lightweight* index (presence flags only). Storing the
> actual `description` text and `location` JSON makes the index heavier and a second copy of OneDrive
> content — but it removes the boolean smell, makes the review screen self-sufficient (no per-photo Graph
> fetch), and fits ADR-0009's "D1 mirrors mutable state, updated post-write without re-crawl" pattern.
> Most `description` cells are `NULL` early on, so the weight is modest. *(ADR-0009 column list amended.)*

> The DDL itself (separate track) belongs as an `@effect/sql-d1` migration, applied via Alchemy with the
> (also-plain-SQL) better-auth tables.

---

## 5. Write queue & workflow status (ADR-0011, ADR-0009)

The D1 index is also the source for the **pending writes** of the optimistic mutation queue; the
server-side flusher reads from it, so approved changes survive closing the tab.

Two kinds of write — deliberately separate, since they have different infra:

- **`description`** → cheap Graph `PATCH` (ADR-0002), *outside* the workflow.
- **`location_orientation`** → per-photo **Cloudflare Workflow** (ADR-0011): download → inject EXIF
  GPS+Orientation (piexifjs) → re-upload → verify the `location` facet. **JPEG only.**

```ts
export const WriteKind = Schema.Literals(["description", "location_orientation"])

export const WriteStatus = Schema.Literals([
  "pending",   // approved, not yet sent
  "running",   // PATCH in flight / workflow instance running
  "succeeded",
  "failed",
])

// EXIF Orientation flag (1–8) — the literal value piexifjs writes; 1 = upright (ADR-0008)
export const Orientation = Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8])
export type Orientation = typeof Orientation.Type

// The approved payload — discriminated union on a single-value `kind` Literal. The
// location_orientation re-upload can carry location, orientation, or both (at least one — see open Q).
export const WritePayload = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("description"), text: Description }),
  Schema.Struct({
    kind: Schema.Literal("location_orientation"),
    location: Schema.optionalKey(Location),
    orientation: Schema.optionalKey(Orientation),
  }),
])

export const WriteJob = Schema.Struct({
  photoId: DriveItemId,
  payload: WritePayload,
  status: WriteStatus,
  attempts: Schema.Int,
  workflowInstanceId: Schema.optionalKey(WorkflowInstanceId), // location_orientation only
  error: Schema.optionalKey(Schema.String),
})
export type WriteJob = typeof WriteJob.Type
```

---

## 6. oRPC contract surface (first cut)

Each procedure validates in/out via `Schema.toStandardSchemaV1(...)` (`~standard`). The body runs an
Effect program on the shared `ManagedRuntime`/Layer (ADR-0012).

| procedure                  | input                                            | output            | note |
|----------------------------|--------------------------------------------------|-------------------|------|
| `library.connect`          | (oauth flow)                                     | `{ rootFolder? }` | links OneDrive |
| `library.pickRootFolder`   | `{ folderId: DriveItemId }`                       | `Event[]`?        | folder picker, starts crawl |
| `index.resync`             | `{}`                                             | `{ queued: number }` | manual re-sync button |
| `review.next`              | `{ filter: Literals(["missing_description","missing_location","any"]) }` | `Photo \| null` | the stepper |
| `suggest.description`      | `{ photoId: DriveItemId }`                        | `Suggestion`      | Gemini vision (ADR-0012) |
| `approve.description`      | `{ photoId: DriveItemId, text: Description }`      | `WriteJob`        | → Graph PATCH |
| `approve.location`         | `{ photoId: DriveItemId, location: Location }`    | `WriteJob`        | → Workflow |
| `review.skip`              | `{ photoId: DriveItemId }`                         | `Photo`           | status → skipped |
| `write.status`             | `{ photoId: DriveItemId }`                         | `WriteJob`        | UI polls this |

> Optimistic UI: `approve.*` sets `reviewStatus` locally at once; the real status arrives via `write.status`.

---

## 7. Tagged-error taxonomy (ADR-0012/0013, rule #4)

`Schema.TaggedErrorClass` yields a real `Error`, a `Schema` (serializable over oRPC), and a `_tag` for
`Effect.catchTag`. Fields are struct fields. *(Verified: `check3.mjs`.)*

```ts
import { Schema } from "effect"

export class GraphRequestError extends Schema.TaggedErrorClass()("GraphRequestError", {
  status: Schema.Number,
  retryAfter: Schema.optionalKey(Schema.Number), // 429/Retry-After (ADR-0011)
}) {}

export class TokenUnavailable extends Schema.TaggedErrorClass()("TokenUnavailable", {
  userId: UserId,
}) {}

export class UnsupportedFormat extends Schema.TaggedErrorClass()("UnsupportedFormat", {
  photoId: DriveItemId,
  mimeType: Schema.String, // location/orientation is JPEG only
}) {}

export class LocationVerifyTimeout extends Schema.TaggedErrorClass()("LocationVerifyTimeout", {
  photoId: DriveItemId,    // Graph extracts the facet async ~6–9s (ADR-0011)
}) {}

export class IndexNotReady extends Schema.TaggedErrorClass()("IndexNotReady", {}) {}
```

---

## Open decisions / verify-at-build

1. **~~Identifier language~~** — *resolved: everything English* (rule #2).
2. **~~Orientation field~~** — *resolved: EXIF Orientation 1–8* (`Orientation`, §5), optional on the
   `location_orientation` payload alongside an optional `location`.
3. **~~No-year fallback~~** — *resolved: `year` is `NullOr` (null = unknown)*; photo stays indexed.
4. **~~Schema → Standard Schema export on smol~~** — ✅ **DONE** (ADR-0012 verify #1): `Schema.toStandardSchemaV1()`
   works (`web/spike/standard-schema`). The whole doc is ported to verified v4.
5. **~~Gemini vision + structured output~~** — ✅ **DONE** (ADR-0012 verify #2): via **`@tanstack/ai` +
   `@tanstack/ai-gemini`** (native Gemini SDK), `outputSchema = Schema.toStandardJSONSchemaV1(Suggestion)`,
   wrapped in Effect. `@effect/ai-openai` rejected (Responses-API-only). `web/spike/gemini-vision`.
6. **~~`@effect/sql-d1` + better-auth on D1~~** — ✅ **DONE** (spike #2): `@effect/sql-d1` + `PhotoFromRow`
   and better-auth **native D1** (`database: env.DB`, drizzle-free) both pass on miniflare. `web/spike/sql-d1`.

### Remaining refinements

- **`location_orientation` "at least one"** — a `Schema.check` should reject a payload with neither
  `location` nor `orientation`. Not yet added.
- **Year-folder edge cases** — `YearFromPath` takes the shallowest 4-digit segment; harden against paths
  with two 4-digit segments (e.g. an event named "Trip 2019" under year folder 2018) against a real tree.
- **Absent-key Graph fields** — confirm `optionalKey(decodeTo(...))` for `description`/`location` when
  lifting (§3 note).
