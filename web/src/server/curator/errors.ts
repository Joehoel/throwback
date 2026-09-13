import { Schema } from "effect";

/** The request has no valid Better Auth Microsoft session. */
export class AuthenticationRequired extends Schema.TaggedError<AuthenticationRequired>()(
  "AuthenticationRequired",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/** The signed-in Microsoft account is not the claimed Curator. */
export class CuratorOwnershipConflict extends Schema.TaggedError<CuratorOwnershipConflict>()(
  "CuratorOwnershipConflict",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Session or Curator persistence could not be checked safely. */
export class CuratorAccessUnavailable extends Schema.TaggedError<CuratorAccessUnavailable>()(
  "CuratorAccessUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 },
) {}
