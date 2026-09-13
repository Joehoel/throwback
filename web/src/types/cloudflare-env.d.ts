import type { D1Database } from "@cloudflare/workers-types";

declare global {
  namespace Cloudflare {
    interface Env {
      readonly APP_ENVIRONMENT: "preview";
      readonly DB: D1Database;
      readonly BETTER_AUTH_SECRET: string;
      readonly BETTER_AUTH_URL: string;
      readonly MICROSOFT_CALLBACK_URL: string;
      readonly MICROSOFT_CLIENT_ID: string;
      readonly MICROSOFT_CLIENT_SECRET: string;
    }
  }
}

export {};
