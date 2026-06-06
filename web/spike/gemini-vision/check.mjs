// P0 spike #3 (ADR-0012 verify #2) — Gemini vision + STRUCTURED OUTPUT over the OpenAI-compat endpoint,
// via @effect/ai-openai + core effect/unstable/ai LanguageModel.generateObject.
// Question: do (a) image input and (b) json-schema structured output survive Gemini's OpenAI-compat layer?
// Run: export GEMINI_API_KEY=...; node check.mjs   (key loaded from web/.dev.vars, never printed)
import { Effect, Layer, Redacted, Schema } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("FAIL: GEMINI_API_KEY not in env (load web/.dev.vars first)");
  process.exit(2);
}

// The structured output we want from a photo (mirrors domain Suggestion + tags).
const PhotoSuggestion = Schema.Struct({
  description: Schema.NonEmptyString, // Dutch caption suggestion
  tags: Schema.Array(Schema.String),
});

// A valid 1x1 baseline JPEG (enough to prove the vision pipeline accepts an image).
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
  "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";
const imageBytes = Uint8Array.from(Buffer.from(JPEG_B64, "base64"));

const ClientLayer = OpenAiClient.layer({
  apiKey: Redacted.make(apiKey),
  apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
}).pipe(Layer.provide(FetchHttpClient.layer));

const ModelLayer = OpenAiLanguageModel.layer({ model: "gemini-2.5-flash" }).pipe(Layer.provide(ClientLayer));

const program = Effect.gen(function* () {
  return yield* LanguageModel.generateObject({
    objectName: "PhotoSuggestion",
    schema: PhotoSuggestion,
    prompt: [
      {
        role: "user",
        content: [
          { type: "text", text: "Je schrijft onderschriften voor familiefoto's. Geef een korte Nederlandse beschrijving en 1-3 tags voor deze afbeelding." },
          { type: "file", mediaType: "image/jpeg", data: imageBytes },
        ],
      },
    ],
  });
});

try {
  const res = await Effect.runPromise(program.pipe(Effect.provide(ModelLayer)));
  console.log("response keys:", Object.keys(res).join(", "));
  console.log("structured value:", JSON.stringify(res.value, null, 2));
  const ok = typeof res.value?.description === "string" && Array.isArray(res.value?.tags);
  console.log(ok
    ? "\nPASS: Gemini vision + structured output works over the OpenAI-compat layer (ADR-0012 #2)"
    : "\nFAIL: response did not match the schema shape");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("\nFAIL:", e?.message ?? e);
  if (e?.cause) console.error("cause:", e.cause?.message ?? e.cause);
  process.exit(1);
}
