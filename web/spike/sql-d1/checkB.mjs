// P0 spike #2, Part B — better-auth on Kysely + kysely-d1 against the SAME miniflare D1, NO drizzle.
// Validates the drizzle-removal decision: (1) auto-migrations on D1 (the known footgun), (2) auth ops.
import { Miniflare } from "miniflare";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { D1Dialect } from "kysely-d1";

const mf = new Miniflare({
  modules: true,
  script: "export default {};",
  compatibilityDate: "2025-09-02",
  d1Databases: { DB: "auth" },
});

let migOk = false, migErr = null, authOk = false, authErr = null;
try {
  const db = await mf.getD1Database("DB");

  const options = {
    database: { dialect: new D1Dialect({ database: db }), type: "sqlite" },
    emailAndPassword: { enabled: true },
    secret: "spike-secret-please-ignore-0123456789",
    baseURL: "http://localhost:3000",
  };

  // 1) migrations — the documented D1 footgun (introspection via the kysely D1 dialect)
  try {
    const { runMigrations, toBeCreated } = await getMigrations(options);
    console.log("tables to create:", (toBeCreated ?? []).map((t) => t.table ?? t).join(", ") || "(none)");
    await runMigrations();
    migOk = true;
  } catch (e) {
    migErr = e;
  }
  console.log("migrations:", migOk ? "OK" : `FAILED — ${migErr?.message}`);

  // 2) auth operations (only if tables exist)
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
console.log(pass ? "\nPASS: better-auth on Kysely/D1, no drizzle" : "\nFAIL (see above)");
process.exit(pass ? 0 : 1);
