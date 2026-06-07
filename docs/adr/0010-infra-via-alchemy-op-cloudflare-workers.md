# Infra als code via Alchemy v2, gedeployed op Cloudflare Workers

De **Beheer-webapp** (TanStack Start + React 19) draait op **Cloudflare Workers** en de hele Cloudflare-infra — Worker, D1, Workflows, secrets, route/DNS — wordt gemodelleerd in **Alchemy v2** (de Effect-rewrite, `alchemy/Cloudflare`), als **enige bron van waarheid**. Dev draait via `alchemy dev`, deploy via `alchemy deploy`, en Alchemy's **state staat in Cloudflare** (`Cloudflare.state()` — Worker + Durable Object + SQLite, keys in Secrets Store). De handmatige `wrangler.jsonc` verdwijnt zodat bindings niet op twee plekken hoeven te kloppen.

## Considered Options

- **Alchemy v2 = enige bron van waarheid** (gekozen): type-veilige IaC in TypeScript, één plek voor Worker + D1 + Workflows + secrets + `Cloudflare.Vite`, met versiebeheerde state.
- **Hand-`wrangler.jsonc` + `@cloudflare/vite-plugin`** (de scaffold-default): standaard en goed gedocumenteerd, maar bindings + provisioning verspreid; geen IaC-state; meer handwerk bij Workflows/secrets/DNS.
- **Hybride** (wrangler voor dev, Alchemy voor provisioning): verworpen — twee bronnen van waarheid → driftrisico op bindings.

## Consequences

- **Bleeding-edge:** Alchemy v2 is jong en minder gedocumenteerd dan de v0.x-lijn en dan wrangler. Risico bij randgevallen; mitigatie: het is "embeddable" en heeft een escape-hatch, dus een ontbrekende resource kan handmatig.
- **Workflows-resource bevestigd (2026-06-05):** Alchemy v2 heeft een eigen Workflows-tutorial/resource — workflow-class definiëren, aan de Worker binden, triggeren via `notifier.create({...})` + pollen met `instance.status()` (ADR-0011). Geen handmatige binding nodig.
- **Dev-loop verschuift** van de `@cloudflare/vite-plugin` (`vite dev` in workerd) naar `alchemy dev` (draait de Worker lokaal + deployt resources naar een dev-stage). Vergt internet en een dev-stage; in ruil daarvoor één consistente dev/deploy-keten.
- **Stages dev + prod**; secrets via Alchemy `StoreSecret`; D1-migraties als drizzle-kit-SQL die de `D1Database`-resource bij deploy toepast.
- **Deploy:** custom (sub)domein via Alchemy (route + DNS) → stabiele `BETTER_AUTH_URL` en één prod-redirect-URI in Azure. Voorlopig **handmatig `alchemy deploy`** (single-user tool); GitHub Actions is een latere optie.

## Status

**Geaccepteerd (2026-06-05), bouw nog te starten.** Beide pre-bouw-checks geslaagd: Alchemy v2 Workflows-resource bestaat, en piexifjs rondt GPS + Orientation lossless door in workerd (`web/spike/piexif_check.*`, miniflare).
