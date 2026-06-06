// P0 spike #2, Part D — isolate the cause: does better-auth CORE support a raw D1Database natively
// (no better-auth-cloudflare, no external kysely-d1, no drizzle)? Just `database: db`.
import { Miniflare } from "miniflare";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const mf = new Miniflare({
  modules: true,
  script: "export default {};",
  compatibilityDate: "2025-09-02",
  d1Databases: { DB: "core" },
});

let migOk = false, migErr = null, authOk = false, authErr = null;
try {
  const db = await mf.getD1Database("DB");

  // The whole config: pass the raw D1Database straight to better-auth. No wrapper, no dialect, no drizzle.
  const options = {
    database: db,
    emailAndPassword: { enabled: true },
    secret: "spike-secret-please-ignore-0123456789",
    baseURL: "http://localhost:3000",
  };

  try {
    const { runMigrations, toBeCreated } = await getMigrations(options);
    console.log("tables to create:", (toBeCreated ?? []).map((t) => t.table ?? t).join(", ") || "(none)");
    await runMigrations();
    migOk = true;
  } catch (e) {
    migErr = e;
  }
  console.log("migrations:", migOk ? "OK" : `FAILED — ${migErr?.message}`);

  if (migOk) {
    try {
      const auth = betterAuth(options);
      const signUp = await auth.api.signUpEmail({ body: { email: "dad@example.com", password: "hunter2pw!", name: "Dad" }, asResponse: false });
      const signIn = await auth.api.signInEmail({ body: { email: "dad@example.com", password: "hunter2pw!" }, asResponse: false });
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
console.log(pass ? "\nPASS: better-auth CORE supports raw D1 natively — drizzle-free, ZERO extra deps" : "\nFAIL — the wrapper (better-auth-cloudflare) is doing something extra");
process.exit(pass ? 0 : 1);
