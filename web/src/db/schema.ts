// Database schema barrel. better-auth tables live in `auth-schema.ts`
// (regenerate with `npx @better-auth/cli generate`). App tables go below.
export { account, session, user, verification } from "./auth-schema";
