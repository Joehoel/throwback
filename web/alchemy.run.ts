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

export class Website extends Cloudflare.Vite<Website>()("Website", {
  name: "throwback-web",
  compatibility: {
    date: "2026-06-06",
    flags: ["nodejs_compat"],
  },
  env: {
    DB,
    MICROSOFT_CLIENT_ID: Config.redacted("MICROSOFT_CLIENT_ID"),
    MICROSOFT_CLIENT_SECRET: Config.redacted("MICROSOFT_CLIENT_SECRET"),
    BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Config.string("BETTER_AUTH_URL"),
    GEMINI_API_KEY: Config.redacted("GEMINI_API_KEY"),
  },
  dev: { port: 3000 },
}) {}

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
