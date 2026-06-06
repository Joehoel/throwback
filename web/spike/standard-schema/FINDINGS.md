# Spike: Effect v4 (smol) Schema surface — FINDINGS

**Verdict (2026-06-06, `effect@4.0.0-beta.78`):** ✅ Every Schema capability the domain model needs
exists on v4 — but v4 is a **large rename** of v3, and much of what `domain-model.md` hand-wrote is now a
**built-in**. ADR-0012 verify-at-build #1 (Standard Schema export for oRPC) is **GREEN** via
`Schema.toStandardSchemaV1()`.

Run: `npm i && node check.mjs` (raw probe) · `node check3.mjs` (verified patterns, 10/10 pass).

## v3 (as written in the doc) → v4 (verified)

| doc (v3-shaped) | v4 verified | note |
|---|---|---|
| `Schema.transform(From, To, {decode, encode})` | `From.pipe(Schema.decodeTo(To, SchemaTransformation.transform({decode, encode})))` | also `{decode: SchemaGetter.transform(fn), encode: …}` |
| `Schema.transformOrFail(...)` (fail via `ParseResult.fail`) | `decodeTo` with `SchemaGetter.transformOrFail` (returns `Effect<T, SchemaIssue.Issue>`) / `SchemaGetter.fail` | `ParseResult` is gone |
| `Schema.fromKey("k")` per field | **struct-level** `Schema.encodeKeys({ folderId: "folder_id", … })` | one mapping object, cleaner |
| `Schema.optionalWith(S, {nullable:true})` | `Schema.optionalKey(Schema.NullOr(S))` | absent→omitted, null→null |
| `Schema.optionalWith(S, {default})` | `Schema.optionalKey(S).pipe(Schema.withDecodingDefault(eff))` | or `SchemaGetter.withDefault` |
| `Schema.parseJson(S)` | `Schema.fromJsonString(S)` | for the `location` JSON column |
| `Schema.TaggedError<E>()("E", {...})` | `Schema.TaggedErrorClass()("E", {...})` | still a real `Error` + `_tag` |
| `Schema.DateTimeUtc` (parse ISO) | `Schema.DateTimeUtcFromString` | plain `DateTimeUtc` is from-self only |
| `Schema.Number.pipe(Schema.int())` | `Schema.Int` | |
| `Schema.String.pipe(Schema.minLength(1))` | `Schema.NonEmptyString` | or `Schema.check(Schema.isMinLength(1))` |
| `Schema.between(a,b)` | `Schema.check(Schema.isBetween(a,b))` | refinements are `check` + `is*` predicates |
| custom `BitFlag` (0/1↔bool) | **built-in** `Schema.BooleanFromBit` | delete our BitFlag |
| `Schema.standardSchemaV1` | `Schema.toStandardSchemaV1(s)["~standard"]` | oRPC contract bridge ✅ |
| `Schema.Literal("a","b","c")` (union) | `Schema.Literals(["a","b","c"])` | **`Literal` is single-value only in v4** — multi-arg silently keeps the first! |
| `Schema.between(a,b)` | `Schema.check(Schema.isBetween({ minimum: a, maximum: b }))` | options object, not positional |
| domain "missing" field via optional | `Schema.NullOr(X)` (null = missing) | maps 1:1 to a nullable D1 column; no collapse needed |
| `Schema.brand`, `Struct`, `String/Number/Boolean`, `NullOr`, `UndefinedOr`, `optionalKey`, `decodeUnknownSync`, `encodeSync` | unchanged | |

## Composite patterns verified (check4.mjs)

- **Row codec:** `Schema.Struct({ ...NullOr fields..., location: Schema.NullOr(Schema.fromJsonString(Location)) }).pipe(Schema.encodeKeys({ folderId: "folder_id", ... }))` — decodes rows with values *and* nulls, encodes back to snake-case + JSON string. `NullOr` ↔ SQL `NULL` is the clean mapping (replaces v3 `optionalWith({nullable})`).
- **Graph projection:** nested `Schema.encodeKeys({ folderId: "id", year: "path" })` for the rename, then `from.pipe(Schema.decodeTo(Photo, { decode: SchemaGetter.transform(flatten), encode: SchemaGetter.forbidden(() => "...") }))` for the flatten — decode works, encode is correctly forbidden (one-way ingest).

## Useful built-ins discovered (less custom code)

- `Schema.BooleanFromBit`, `Schema.Int`, `Schema.NonEmptyString`, `Schema.DateTimeUtcFromString`,
  `Schema.fromJsonString`, `Schema.encodeKeys`.
- `SchemaTransformation.snakeToCamel()` / `SchemaGetter.snakeToCamel` exist but are **value-level**
  (string→string), not key-level — for column-name renames use `encodeKeys`.
- Modules now live at top level: `Schema`, `SchemaTransformation`, `SchemaGetter`, `SchemaIssue`,
  `SchemaAST`, `SchemaParser`. No `ParseResult` export; getters fail with `SchemaIssue.Issue`.

## Impact on `domain-model.md`

The doc's approach holds and gets **simpler**: struct-level `encodeKeys` replaces per-field `fromKey`;
`BooleanFromBit`/`fromJsonString`/`DateTimeUtcFromString`/`Int`/`NonEmptyString` replace hand-rolled
mappers; errors use `TaggedErrorClass`; transforms use `decodeTo` + `SchemaTransformation`. Port is
mechanical — this table is the key.
