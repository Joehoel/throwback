import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import {
  LOCAL_URL,
  PREVIEW_DOMAIN,
  PREVIEW_URL,
  PreviewBetterAuthSecret,
  PreviewDB,
} from "./infrastructure.ts";
import { LibraryIndexWorker } from "./library-index-worker.ts";

export { PreviewDB } from "./infrastructure.ts";

export class Website extends Cloudflare.Website.Vite<Website>()(
  "PreviewWebsite",
  Effect.gen(function* () {
    const { dev } = yield* Alchemy.AlchemyContext;
    const baseUrl = dev ? LOCAL_URL : PREVIEW_URL;
    const allowedEmail = dev
      ? "local-preview@example.invalid"
      : yield* Config.String("PREVIEW_ACCESS_ALLOWED_EMAIL").pipe(Effect.orDie);

    return {
      name: "throwback-curation-preview",
      domain: PREVIEW_DOMAIN,
      url: false,
      access: {
        name: "Throwback Curation preview",
        sessionDuration: "720h",
        policies: [
          {
            name: "Throwback Curation preview curator",
            decision: "allow",
            include: [{ email: allowedEmail }],
          },
        ],
      },
      compatibility: {
        date: "2026-06-02",
        flags: ["nodejs_compat"],
      },
      env: {
        APP_ENVIRONMENT: "preview",
        DB: PreviewDB,
        BETTER_AUTH_SECRET: PreviewBetterAuthSecret,
        BETTER_AUTH_URL: baseUrl,
        MICROSOFT_CLIENT_ID: "0bb9b8c8-a9e6-475d-b44f-74521e46aaf1",
        MICROSOFT_CLIENT_SECRET: Config.Redacted("MICROSOFT_CLIENT_SECRET"),
        MICROSOFT_CALLBACK_URL: `${baseUrl}/api/auth/callback/microsoft`,
        LIBRARY_INDEXER: LibraryIndexWorker,
      },
      dev: { host: "localhost", port: 3000, strictPort: true },
    };
  }),
) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "ThrowbackCurationPreview",
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
