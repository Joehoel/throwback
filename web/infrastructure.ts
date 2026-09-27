import { makeRandom } from "alchemy";
import { D1 } from "alchemy/Cloudflare";

export const PREVIEW_DOMAIN = "curation-preview.kuijper.fyi";

export const PREVIEW_URL = `https://${PREVIEW_DOMAIN}`;

export const LOCAL_URL = "http://localhost:3000";

export const PreviewDB = D1.Database("PreviewDB", {
  name: "throwback-curation-preview",
  jurisdiction: "eu",
  migrations: "./migrations",
});

export const PreviewBetterAuthSecret = makeRandom("PreviewBetterAuthSecret");
