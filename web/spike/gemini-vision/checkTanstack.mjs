// P0 spike #3 (alt path the user chose) — @tanstack/ai + @tanstack/ai-gemini for vision + structured
// output, with effect/Schema plugged in via Schema.toStandardSchemaV1 (Standard Schema bridge).
// @tanstack/ai-gemini uses Gemini's NATIVE SDK (@google/genai) — no OpenAI-compat /responses problem.
// Run: export GEMINI_API_KEY=...; node checkTanstack.mjs
import { chat } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";
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

try {
  const result = await chat({
    adapter: createGeminiChat("gemini-2.5-flash", apiKey),
    outputSchema: Schema.toStandardJSONSchemaV1(PhotoSuggestion), // effect/Schema -> Standard Schema v1
    stream: false,
    messages: [{
      role: "user",
      content: [
        { type: "text", content: "Je schrijft onderschriften voor familiefoto's. Geef een korte Nederlandse beschrijving en 1-3 tags voor deze afbeelding." },
        { type: "image", source: { type: "data", value: JPEG_B64, mimeType: "image/jpeg" } },
      ],
    }],
  });

  console.log("result:", JSON.stringify(result));
  // Standard-schema validation already ran inside @tanstack/ai; double-check the effect type too.
  const decoded = Schema.decodeUnknownSync(PhotoSuggestion)(result);
  const ok = typeof decoded.description === "string" && Array.isArray(decoded.tags);
  console.log(ok
    ? "\nPASS: @tanstack/ai + ai-gemini vision + structured output, effect/Schema via toStandardSchemaV1"
    : "\nFAIL: shape");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("\nFAIL:", e?.message ?? e);
  if (e?.issues) console.error("issues:", JSON.stringify(e.issues).slice(0, 400));
  process.exit(1);
}
