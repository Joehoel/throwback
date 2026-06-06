// P0 spike #2, Part C — better-auth-cloudflare against miniflare D1.
// Tests the DRIZZLE-FREE mode: withCloudflare({ d1Native }) -> better-auth's built-in Kysely D1 dialect.
// Question: does this make migrations + auth work on D1 where raw kysely-d1 (Part B) failed?
import { Miniflare } from "miniflare";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { withCloudflare } from "better-auth-cloudflare";

const mf = new Miniflare({
  modules: true,
  script: "export default {};",
  compatibilityDate: "2025-09-02",
  d1Databases: { DB: "bac" },
});

let migOk = false, migErr = null, authOk = false, authErr = null;
try {
  const db = await mf.getD1Database("DB");

  const options = withCloudflare(
    { d1Native: db, autoDetectIpAddress: false, geolocationTracking: false },
    {
      emailAndPassword: { enabled: true },
      secret: "spike-secret-please-ignore-0123456789",
      baseURL: "http://localhost:3000",
    },
  );

  // 1) migrations via better-auth's built-in D1 dialect
  try {
    const { runMigrations, toBeCreated } = await getMigrations(options);
    console.log("tables to create:", (toBeCreated ?? []).map((t) => t.table ?? t).join(", ") || "(none)");
    await runMigrations();
    migOk = true;
  } catch (e) {
    migErr = e;
  }
  console.log("migrations:", migOk ? "OK" : `FAILED — ${migErr?.message}`);

  // 2) auth ops
  if (migOk) {
    try {
      const auth = betterAuth(options);
      const signUp = await auth.api.signUpEmail({
        body: { email: "dad@example.com", password: "hunter2pw!", name: "Dad" },
        asResponse: false,
      });
      const signIn = await auth.api.signInEmail({
        body: { email: "dad@example.com", password: "hunter2pw!" },
        asResponse: false,
      });
      const users = await db.prepare("SELECT email FROM user").all();
      authOk = !!signUp?.user?.email && (users.results?.length ?? 0) > 0 && !!(signIn?.token || signIn?.user);
      console.log("signUp.user:", signUp?.user?.email, "| signIn ok:", !!(signIn?.token || signIn?.user), "| user rows:", users.results?.length);
    } catch (e) {
      authErr = e;
    }
    console.log("auth ops:", authOk ? "OK" : `FAILED — ${authErr?.message}`);
  }
} catch (e) {
  console.error("FATAL:", e);
}

await mf.dispose();
const pass = migOk && authOk;
console.log(pass ? "\nPASS: better-auth-cloudflare d1Native (drizzle-free) works on D1" : "\nFAIL (see above)");
process.exit(pass ? 0 : 1);
