# Spike #3: Gemini vision + structured output (ADR-0012 verify #2) — FINDINGS

`effect@4.0.0-beta.78`, `@tanstack/ai@0.28`, `@tanstack/ai-gemini@0.15`, `@effect/ai-openai@4.0.0-beta.78`
(rejected). Key from `web/.dev.vars` (`GEMINI_API_KEY`).
Run: `export GEMINI_API_KEY=...; node checkTanstack.mjs` (PASS) · `node check.mjs` (@effect/ai-openai, fails).

## Verdict: ✅ GREEN via **@tanstack/ai + @tanstack/ai-gemini** (chosen by user 2026-06-06)

`@tanstack/ai-gemini` uses Gemini's **native SDK** (`@google/genai`) — no OpenAI-compat layer, no
`/responses` gap. Vision + structured output work, and **effect/Schema bridges in via
`Schema.toStandardJSONSchemaV1(...)`**. Returned a real Dutch caption + tags, re-validated by
`Schema.decodeUnknownSync`.

```js
import { chat } from "@tanstack/ai"
import { createGeminiChat } from "@tanstack/ai-gemini"
import { Schema } from "effect"

const result = await chat({
  adapter: createGeminiChat("gemini-2.5-flash", apiKey),
  outputSchema: Schema.toStandardJSONSchemaV1(Suggestion), // NOT toStandardSchemaV1 — needs the JSON-schema converter
  stream: false,
  messages: [{ role: "user", content: [
    { type: "text", content: "…" },
    { type: "image", source: { type: "data", value: base64Jpeg, mimeType: "image/jpeg" } },
  ]}],
})
// result is the parsed object; decode again with effect/Schema for the branded domain type.
```

## Integration shape (plan P4)

- **`SuggestionClient`** wraps `@tanstack/ai`'s `chat(...)` in `Effect.tryPromise` at the oRPC/server
  boundary ("Effect wrapper where it makes sense"). `outputSchema = Schema.toStandardJSONSchemaV1(Suggestion)`;
  decode the result with `Schema.decodeUnknownSync(Suggestion)` for the domain type. Model id + key via
  `effect/Config` (`GEMINI_API_KEY`, redacted).
- **`@tanstack/ai-react`** for client-side AI UI (suggestion display now; streaming chat later if added).
- Deps: `@tanstack/ai`, `@tanstack/ai-gemini`, `@tanstack/ai-react` (+ transitive `@google/genai`). These
  don't depend on Effect → no v4 invariant conflict.

## Rejected: `@effect/ai-openai` ❌ (`check.mjs`)

v4's `OpenAiLanguageModel` is hard-wired to OpenAI's **Responses API** (`POST /responses`); Gemini's
compat layer only serves `/chat/completions` → 404. No chat-completions toggle. Dropped.

## Fallback on file: hand-roll (`checkRaw.mjs`)

Direct POST to Gemini `/chat/completions` with `response_format: json_schema` also works (✅) — kept as a
reference if we ever want to drop the `@tanstack/ai` dep.

## Confirm when building

- `toStandardJSONSchemaV1(...)["~standard"].jsonSchema` introspected as `{}` standalone, yet the call
  returned the correct shape — confirm the schema is actually enforced server-side (vs prompt-inferred +
  our decode). Either way our `Schema.decodeUnknownSync` enforces the contract on the way out.
