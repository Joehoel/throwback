import { createAuthClient } from "better-auth/client";

/** Same-origin Better Auth browser client. */
export const authClient = createAuthClient();

/** Start the personal Microsoft OAuth flow and return to server-directed routing. */
export function signInWithMicrosoft() {
  return authClient.signIn.social({
    callbackURL: "/",
    errorCallbackURL: "/sign-in",
    provider: "microsoft",
  });
}
