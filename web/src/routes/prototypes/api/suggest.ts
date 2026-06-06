/**
 * Prototype suggestion endpoint — the REAL TanStack AI swap.
 *
 * Runs in the Worker: fetches the photo and asks Gemini (via @tanstack/ai +
 * @tanstack/ai-gemini, the path verified in web/spike/gemini-vision) for a short
 * Dutch caption AND a place-name guess. Per ADR-0008 / the hybrid design, Gemini
 * returns a *place name* (from the event/folder context + landmark vision), never
 * raw coordinates — the client geocodes the name to lat/lon (Google Maps JS).
 *
 * Reads GEMINI_API_KEY from the Worker env; without it returns 503 so the client
 * falls back to the simulated stream. The AI libs are imported dynamically so a
 * workerd load/runtime failure is caught per-request. JPEG-only image input.
 */
import { createFileRoute } from "@tanstack/react-router";
import { env } from "#/env";

function buildPrompt(eventName: string, period: string): string {
  return [
    "Je helpt bij het catalogiseren van familiefoto's. Bekijk de foto en gebruik de context.",
    `Context — gebeurtenis: "${eventName || "onbekend"}", periode: "${period || "onbekend"}".`,
    "Antwoord met UITSLUITEND geldige JSON, zonder uitleg of code-fences, in dit formaat:",
    '{"description": "<één korte, feitelijke Nederlandse beschrijving, max ~12 woorden>", "place": "<herkenbare plaatsnaam (landmark/stad/streek/land) of null>"}',
    'Voor "place": herken landmarks of plaatsen in de foto; val anders terug op de context-hint; gebruik null als je het echt niet weet.',
  ].join("\n");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseSuggestion(raw: string): { description: string; place: string | null } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as { description?: unknown; place?: unknown };
    const description = typeof obj.description === "string" ? obj.description.trim() : cleaned;
    const place =
      typeof obj.place === "string" && obj.place.trim() && obj.place.trim().toLowerCase() !== "null"
        ? obj.place.trim()
        : null;
    return { description: description || cleaned, place };
  } catch {
    return { description: cleaned, place: null };
  }
}

export const Route = createFileRoute("/prototypes/api/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Empty string when GEMINI_API_KEY is unset in .env.local (the source
        // alchemy resolves via Config.redacted) → fall back to the simulation.
        const key = (env as Record<string, string | undefined>).GEMINI_API_KEY;
        if (!key) return Response.json({ error: "no_key" }, { status: 503 });

        let body: { seed?: string; orientation?: string; eventName?: string; period?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "bad_body" }, { status: 400 });
        }

        const seed = body.seed ?? "throwback";
        const [w, h] = body.orientation === "portrait" ? [384, 512] : [512, 384];

        try {
          const imgRes = await fetch(`https://picsum.photos/seed/${seed}/${w}/${h}`);
          if (!imgRes.ok) return Response.json({ error: "image_fetch" }, { status: 502 });
          const b64 = toBase64(new Uint8Array(await imgRes.arrayBuffer()));

          const { chat } = await import("@tanstack/ai");
          const { createGeminiChat } = await import("@tanstack/ai-gemini");
          const text = await chat({
            adapter: createGeminiChat("gemini-2.5-flash", key),
            stream: false,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", content: buildPrompt(body.eventName ?? "", body.period ?? "") },
                  { type: "image", source: { type: "data", value: b64, mimeType: "image/jpeg" } },
                ],
              },
            ],
          });
          return Response.json(parseSuggestion(String(text)));
        } catch (e) {
          return Response.json(
            { error: "ai_failed", detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
