import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { AccessApplication } from "./infra/cloudflare/access-application.ts";
import { AccessPolicy } from "./infra/cloudflare/access-policy.ts";
import { accessProviders } from "./infra/cloudflare/providers.ts";

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
    // Compose our custom Access resources on top of the Cloudflare catalog.
    // `provideMerge` hands Cloudflare's credentials/environment/retry to the
    // Access providers, and both collections end up in the stack context.
    providers: accessProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website;

    // Optional edge lock-down: when `ACCESS_ALLOWED_EMAILS` is set (a
    // comma-separated allowlist), gate the domain behind a Cloudflare Access
    // app. Access challenges every visitor with a one-time PIN emailed to the
    // address they enter and only admits listed addresses. Unset = no Access
    // app provisioned. Identity-based, so it works from any network/IP.
    const allowedEmailsCsv = yield* Config.string("ACCESS_ALLOWED_EMAILS").pipe(
      Config.option,
    );
    if (Option.isSome(allowedEmailsCsv)) {
      const emails = allowedEmailsCsv.value
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email.length > 0);
      if (emails.length > 0) {
        const allowed = yield* AccessPolicy("AllowedPeople", {
          name: "Allowed people",
          decision: "allow",
          include: emails.map((email) => ({ email: { email } })),
        });
        yield* AccessApplication("Lock", {
          name: "Throwback (email-locked)",
          domain: DOMAIN,
          policyIds: [allowed.policyId],
        });
      }
    }

    return {
      url: website.url.as<string>(),
    };
  }),
);
