import { Schema } from "effect";

class AuthNotConfigured extends Schema.TaggedError<AuthNotConfigured>()(
  "AuthNotConfigured",
  {
    message: Schema.String,
  },
  { httpApiStatus: 501 },
) {}

const unavailable = AuthNotConfigured.make({
  message: "Authentication is not configured in this scaffold preview.",
});

export function handleUnconfiguredAuthRequest(): Response {
  return Response.json(unavailable, { status: 501 });
}
