// P0 spike — verify the REAL Effect v4 (smol) Schema API surface that domain-model.md assumes.
// The doc is written v3-shaped; this probes what actually exists on effect@4.0.0-beta.78.
// Run: cd web/spike/standard-schema && npm i && node check.mjs
import * as EffectMod from "effect";

const Schema = EffectMod.Schema;
const ParseResult = EffectMod.ParseResult;

const results = [];
const check = (name, fn) => {
  try {
    const v = fn();
    results.push([name, "PASS", v == null ? "" : String(v)]);
  } catch (e) {
    results.push([name, "FAIL", e?.message ?? String(e)]);
  }
};
const has = (obj, k) => (obj && k in obj ? "yes" : "NO");

console.log("effect version:", EffectMod?.constructor?.name ? "(module)" : "(module)");
console.log(
  "effect top-level present:",
  ["Schema", "ParseResult", "Effect", "Layer", "Config", "Data", "DateTime"]
    .map((k) => `${k}:${has(EffectMod, k)}`)
    .join("  "),
);
console.log(
  "Schema.* present:",
  [
    "Struct", "String", "Number", "Boolean", "Literal", "optional", "optionalWith",
    "transform", "transformOrFail", "fromKey", "parseJson", "brand", "DateTimeUtc",
    "TaggedError", "NullOr", "UndefinedOr", "decodeUnknownSync", "encodeSync",
    "standardSchemaV1", "int", "Int",
  ]
    .map((k) => `${k}:${has(Schema, k)}`)
    .join("  "),
);
console.log("");

check("Struct decode", () => {
  const S = Schema.Struct({ id: Schema.String, n: Schema.Number });
  return JSON.stringify(Schema.decodeUnknownSync(S)({ id: "a", n: 1 }));
});
check("brand", () => {
  const Id = Schema.String.pipe(Schema.brand("Id"));
  return Schema.decodeUnknownSync(Id)("x");
});
check("transform decode+encode", () => {
  const Bit = Schema.transform(Schema.Literal(0, 1), Schema.Boolean, {
    strict: true, decode: (n) => n === 1, encode: (b) => (b ? 1 : 0),
  });
  return `dec(1)=${Schema.decodeUnknownSync(Bit)(1)} enc(true)=${Schema.encodeSync(Bit)(true)}`;
});
check("fromKey rename", () => {
  const S = Schema.Struct({ folderId: Schema.String.pipe(Schema.fromKey("folder_id")) });
  return JSON.stringify(Schema.decodeUnknownSync(S)({ folder_id: "abc" }));
});
check("optionalWith nullable (decode null + encode absent)", () => {
  const S = Schema.Struct({ year: Schema.optionalWith(Schema.Number, { nullable: true }) });
  const dec = Schema.decodeUnknownSync(S)({ year: null });
  const enc = Schema.encodeSync(S)({});
  return `decode({year:null})=${JSON.stringify(dec)}  encode({})=${JSON.stringify(enc)}`;
});
check("parseJson", () => {
  const S = Schema.parseJson(Schema.Struct({ a: Schema.Number }));
  return JSON.stringify(Schema.decodeUnknownSync(S)('{"a":1}'));
});
check("DateTimeUtc", () => String(Schema.decodeUnknownSync(Schema.DateTimeUtc)("2020-01-01T00:00:00Z")));
check("TaggedError", () => {
  class E extends Schema.TaggedError()("E", { x: Schema.Number }) {}
  const e = new E({ x: 1 });
  return `_tag=${e._tag} x=${e.x} isError=${e instanceof Error}`;
});
check("Standard Schema ~standard", () => {
  const S = Schema.Struct({ a: Schema.String });
  let std = S["~standard"];
  let via = "schema['~standard']";
  if (!std && typeof Schema.standardSchemaV1 === "function") {
    const w = Schema.standardSchemaV1(S);
    std = w["~standard"] ?? w;
    via = "Schema.standardSchemaV1()";
  }
  if (!std) throw new Error("no ~standard (checked schema['~standard'] and Schema.standardSchemaV1)");
  const r = std.validate({ a: "x" });
  return `via ${via}: vendor=${std.vendor} version=${std.version} validate=${typeof std.validate}`;
});
check("ParseResult module", () => `ParseResult=${ParseResult ? "present" : "MISSING"} Type=${ParseResult && "Type" in ParseResult ? "yes" : "NO"}`);

console.log("RESULTS:");
for (const [n, s, d] of results) console.log(`  [${s}] ${n}${d ? ` — ${d}` : ""}`);
const failed = results.filter((r) => r[1] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
