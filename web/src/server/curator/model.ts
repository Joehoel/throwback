import { Schema } from "effect";

/** Better Auth's local identifier for a signed-in person. */
export const BetterAuthUserId = Schema.NonEmptyString.pipe(Schema.brand("BetterAuthUserId"));

/** Better Auth's local identifier for a signed-in person. */
export type BetterAuthUserId = typeof BetterAuthUserId.Type;

/** Microsoft's stable, provider-owned account identifier (`oid`). */
export const MicrosoftAccountId = Schema.NonEmptyString.pipe(Schema.brand("MicrosoftAccountId"));

/** Microsoft's stable, provider-owned account identifier (`oid`). */
export type MicrosoftAccountId = typeof MicrosoftAccountId.Type;

/** The only identity tuple that can own a Throwback installation. */
export const CuratorIdentity = Schema.Struct({
  providerId: Schema.Literal("microsoft"),
  providerAccountId: MicrosoftAccountId,
});

/** The only identity tuple that can own a Throwback installation. */
export type CuratorIdentity = typeof CuratorIdentity.Type;

/** Display-only Microsoft profile fields shown before a claim. */
export const MicrosoftAccountDisplay = Schema.Struct({
  provider: Schema.Literal("microsoft"),
  name: Schema.String,
  email: Schema.String,
});

/** Display-only Microsoft profile fields shown before a claim. */
export type MicrosoftAccountDisplay = typeof MicrosoftAccountDisplay.Type;

/** A Better Auth session resolved to its Microsoft provider identity. */
export interface SignedInMicrosoftAccount {
  readonly userId: BetterAuthUserId;
  readonly identity: CuratorIdentity;
  readonly display: MicrosoftAccountDisplay;
  readonly hasGraphConnection: boolean;
}
