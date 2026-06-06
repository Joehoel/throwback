// Database schema barrel. better-auth tables live in `auth-schema.ts`
// (regenerate with `npx @better-auth/cli generate`). App tables go below.
export {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema";
