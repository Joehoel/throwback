// Discover the real Effect v4 (smol) API surface — names changed from v3.
import * as EffectMod from "effect";
const Schema = EffectMod.Schema;

const grep = (keys, re) => keys.filter((k) => re.test(k)).sort();
const top = Object.keys(EffectMod).sort();
const sk = Object.keys(Schema).sort();

console.log("=== effect top-level keys (" + top.length + ") ===");
console.log(top.join(", "));

console.log("\n=== effect top-level: parse/transform/schema-ish ===");
console.log(grep(top, /parse|Parse|transform|Transform|Schema|AST|Issue|Result/).join(", "));

console.log("\n=== Schema.* keys (" + sk.length + ") ===");
console.log(sk.join(", "));

console.log("\n--- Schema: transform-ish ---", grep(sk, /transform|Transform|decode|Decode|encode|Encode/).join(", "));
console.log("--- Schema: key/struct/field ---", grep(sk, /key|Key|field|Field|Struct|prop|Prop/).join(", "));
console.log("--- Schema: optional/nullable ---", grep(sk, /optional|Optional|null|Null|undefined|Undefined/).join(", "));
console.log("--- Schema: json ---", grep(sk, /json|Json|JSON/).join(", "));
console.log("--- Schema: error/tagged/class ---", grep(sk, /error|Error|Tagged|Class/).join(", "));
console.log("--- Schema: date/time ---", grep(sk, /date|Date|time|Time/).join(", "));
console.log("--- Schema: standard ---", grep(sk, /standard|Standard/).join(", "));
console.log("--- Schema: brand/int ---", grep(sk, /brand|Brand|int|Int/).join(", "));
