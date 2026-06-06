// P0 — verify the REAL v4 patterns the domain doc needs, using discovered names.
import * as EffectMod from "effect";
const { Schema, SchemaTransformation, SchemaGetter } = EffectMod;

const out = [];
const check = (name, fn) => {
  try { out.push([name, "PASS", String(fn())]); }
  catch (e) { out.push([name, "FAIL", e?.message ?? String(e)]); }
};

check("BooleanFromBit (built-in 0/1<->bool)", () =>
  `dec(1)=${Schema.decodeUnknownSync(Schema.BooleanFromBit)(1)} enc(true)=${Schema.encodeSync(Schema.BooleanFromBit)(true)}`);

check("Int + NonEmptyString", () =>
  `${Schema.decodeUnknownSync(Schema.Int)(5)} / ${Schema.decodeUnknownSync(Schema.NonEmptyString)("x")}`);

check("DateTimeUtcFromString", () =>
  String(Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)("2020-01-01T00:00:00Z")));

check("fromJsonString(Struct)", () => {
  const S = Schema.fromJsonString(Schema.Struct({ a: Schema.Number }));
  return JSON.stringify(Schema.decodeUnknownSync(S)('{"a":1}'));
});

check("encodeKeys rename (folderId<->folder_id)", () => {
  const S = Schema.Struct({ folderId: Schema.String }).pipe(Schema.encodeKeys({ folderId: "folder_id" }));
  const dec = Schema.decodeUnknownSync(S)({ folder_id: "abc" });
  const enc = Schema.encodeSync(S)({ folderId: "abc" });
  return `decode({folder_id})=${JSON.stringify(dec)}  encode=${JSON.stringify(enc)}`;
});

check("optionalKey + NullOr (nullable column)", () => {
  const S = Schema.Struct({ year: Schema.optionalKey(Schema.NullOr(Schema.Int)) });
  const decNull = Schema.decodeUnknownSync(S)({ year: null });
  const decAbsent = Schema.decodeUnknownSync(S)({});
  return `decode({year:null})=${JSON.stringify(decNull)}  decode({})=${JSON.stringify(decAbsent)}`;
});

check("custom transform via decodeTo + SchemaTransformation.transform", () => {
  // string -> number (length), reversible-ish
  const S = Schema.String.pipe(
    Schema.decodeTo(Schema.Number, SchemaTransformation.transform({
      decode: (s) => s.length,
      encode: (n) => "x".repeat(n),
    })),
  );
  return `dec("abc")=${Schema.decodeUnknownSync(S)("abc")} enc(2)=${JSON.stringify(Schema.encodeSync(S)(2))}`;
});

check("custom transform via decodeTo + getters", () => {
  const S = Schema.String.pipe(
    Schema.decodeTo(Schema.Number, {
      decode: SchemaGetter.transform((s) => s.length),
      encode: SchemaGetter.transform((n) => "x".repeat(n)),
    }),
  );
  return `dec("abcd")=${Schema.decodeUnknownSync(S)("abcd")}`;
});

check("toStandardSchemaV1 (oRPC ~standard)", () => {
  const S = Schema.Struct({ a: Schema.String });
  const std = Schema.toStandardSchemaV1(S);
  const node = std["~standard"];
  const r = node.validate({ a: "x" });
  return `vendor=${node.vendor} version=${node.version} validate=${typeof node.validate} ok=${JSON.stringify(r)}`;
});

check("TaggedErrorClass", () => {
  class E extends Schema.TaggedErrorClass()("E", { x: Schema.Number }) {}
  const e = new E({ x: 1 });
  return `_tag=${e._tag} x=${e.x} isError=${e instanceof Error}`;
});

console.log("RESULTS:");
for (const [n, s, d] of out) console.log(`  [${s}] ${n}${d ? ` — ${d}` : ""}`);
const failed = out.filter((r) => r[1] === "FAIL");
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
