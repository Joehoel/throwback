import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

config({ path: ".env.local" });

export const DB = Cloudflare.D1Database("DB", {
  name: "throwback-web",
  migrationsDir: "./drizzle",
});

/** Production hostname. The `kuijper.fyi` zone must already exist in the account. */
const DOMAIN = "throwback.kuijper.fyi";

export class Website extends Cloudflare.Vite<Website>()(
  "Website",
  Effect.gen(function* () {
    // `alchemy dev` sets this; deploy leaves it false. Drives the auth base URL
    // so OAuth callbacks point at localhost locally and the real domain in prod.
    const { dev } = yield* Alchemy.AlchemyContext;

    return {
      name: "throwback-web",
      domain: DOMAIN,
      compatibility: {
        date: "2026-06-02",
        flags: ["nodejs_compat"],
      },
      env: {
        DB,
        MICROSOFT_CLIENT_ID: Config.redacted("MICROSOFT_CLIENT_ID"),
        MICROSOFT_CLIENT_SECRET: Config.redacted("MICROSOFT_CLIENT_SECRET"),
        BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
        BETTER_AUTH_URL: dev ? "http://localhost:3000" : `https://${DOMAIN}`,
        GEMINI_API_KEY: Config.redacted("GEMINI_API_KEY"),
      },
      dev: { port: 3000 },
    };
  }),
) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "ThrowbackWeb",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website;

    return {
      url: website.url.as<string>(),
    };
  }),
);
