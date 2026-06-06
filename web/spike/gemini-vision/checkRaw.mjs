// P0 spike #3, fallback path (ADR-0012 #2 contingency) — hand-rolled call to Gemini's OpenAI-compat
// /chat/completions (NOT /responses, which @effect/ai-openai v4 requires and Gemini lacks). Verifies
// vision + json_schema structured output work, then decodes with effect/Schema.
// In production this body goes through effect/unstable/http HttpClient; raw fetch here is just the
// capability probe.
import { Schema } from "effect";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error("FAIL: GEMINI_API_KEY not in env"); process.exit(2); }

const PhotoSuggestion = Schema.Struct({
  description: Schema.NonEmptyString,
  tags: Schema.Array(Schema.String),
});

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
  "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";

const body = {
  model: "gemini-2.5-flash",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "Je schrijft onderschriften voor familiefoto's. Geef een korte Nederlandse beschrijving en 1-3 tags voor deze afbeelding." },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${JPEG_B64}` } },
    ],
  }],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "PhotoSuggestion",
      schema: {
        type: "object",
        properties: {
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["description", "tags"],
        additionalProperties: false,
      },
    },
  },
};

try {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log("HTTP", res.status, res.statusText);
  const json = await res.json();
  if (!res.ok) { console.error("FAIL body:", JSON.stringify(json).slice(0, 400)); process.exit(1); }
  const content = json.choices?.[0]?.message?.content;
  console.log("raw content:", content);
  const decoded = Schema.decodeUnknownSync(PhotoSuggestion)(JSON.parse(content));
  console.log("decoded via effect/Schema:", JSON.stringify(decoded));
  const ok = typeof decoded.description === "string" && Array.isArray(decoded.tags);
  console.log(ok
    ? "\nPASS: Gemini /chat/completions vision + json_schema -> effect/Schema (ADR-0012 #2 via hand-roll)"
    : "\nFAIL: shape");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("\nFAIL:", e?.message ?? e);
  process.exit(1);
}
