import type { CreateAccessPolicyRequest } from "@distilled.cloud/cloudflare/zero-trust";
import * as zeroTrust from "@distilled.cloud/cloudflare/zero-trust";
import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import type { AccessProviders } from "./collection.ts";

/**
 * A single Access rule (one member of a policy's `include`/`exclude`/`require`
 * arrays). Sourced from the distilled SDK so the full Cloudflare union is
 * available — IP (`{ ip: { ip } }`), email, group, geo, everyone, etc.
 */
export type AccessRule = CreateAccessPolicyRequest["include"][number];

/** The action Access takes when a user matches a policy. */
export type AccessDecision = CreateAccessPolicyRequest["decision"];

export interface AccessPolicyProps {
  /** Human-readable policy name (shown in the Zero Trust dashboard). */
  name: string;
  /** Action when a user matches: `allow`, `deny`, `non_identity`, `bypass`. */
  decision: AccessDecision;
  /** Rules OR'd together — a user needs to match only one to be included. */
  include: AccessRule[];
  /** Rules that, if matched, exclude a user even when `include` matched. */
  exclude?: AccessRule[];
  /** Rules a user must ALL satisfy in addition to `include`. */
  require?: AccessRule[];
  /** Token lifetime for sessions authorized by this policy (e.g. `24h`). */
  sessionDuration?: string;
}

/**
 * A reusable Cloudflare Access (Zero Trust) policy at the account level.
 *
 * Reusable policies are the modern model: the policy owns the decision + rule
 * set and is attached to one or more {@link AccessApplication}s by id. The
 * legacy per-application policy endpoint is deprecated and not used here.
 *
 * @example Lock to a single home IP
 * ```typescript
 * const home = yield* AccessPolicy("HomeOnly", {
 *   name: "Home IP only",
 *   decision: "allow",
 *   include: [{ ip: { ip: "203.0.113.7/32" } }],
 * });
 * ```
 */
export type AccessPolicy = Resource<
  "Cloudflare.Access.Policy",
  AccessPolicyProps,
  {
    policyId: string;
    accountId: string;
    name: string;
    decision: AccessDecision;
  },
  never,
  AccessProviders
>;

export const AccessPolicy = Resource<AccessPolicy>("Cloudflare.Access.Policy");

export const AccessPolicyProvider = () =>
  Provider.effect(
    AccessPolicy,
    Effect.gen(function* () {
      const { accountId } = yield* CloudflareEnvironment;
      const create = yield* zeroTrust.createAccessPolicy;
      const get = yield* zeroTrust.getAccessPolicy;
      const update = yield* zeroTrust.updateAccessPolicy;
      const remove = yield* zeroTrust.deleteAccessPolicy;

      const body = (news: AccessPolicyProps) => ({
        name: news.name,
        decision: news.decision,
        include: news.include,
        exclude: news.exclude,
        require: news.require,
        sessionDuration: news.sessionDuration,
      });

      return {
        stables: ["policyId", "accountId"],
        reconcile: Effect.fn(function* ({ news, output }) {
          // Observe — re-fetch the cached policy so we recover from
          // out-of-band deletes or partial state-persistence failures.
          const observed = output?.policyId
            ? yield* get({ accountId, policyId: output.policyId }).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
              )
            : undefined;

          // Ensure/sync — update in place when it still exists, else
          // create. Both calls are idempotent for our declared shape.
          const policyId = observed?.id
            ? ((yield* update({ accountId, policyId: observed.id, ...body(news) })).id ??
              observed.id)
            : (yield* create({ accountId, ...body(news) })).id!;

          return {
            policyId,
            accountId,
            name: news.name,
            decision: news.decision,
          };
        }),
        delete: Effect.fn(function* ({ output }) {
          yield* remove({
            accountId: output.accountId,
            policyId: output.policyId,
          }).pipe(Effect.catch(() => Effect.void));
        }),
        read: Effect.fn(function* ({ output }) {
          if (!output?.policyId) return undefined;
          return yield* get({
            accountId: output.accountId,
            policyId: output.policyId,
          }).pipe(
            Effect.map((p) => ({
              policyId: p.id ?? output.policyId,
              accountId: output.accountId,
              name: p.name ?? output.name,
              decision: (p.decision ?? output.decision) as AccessDecision,
            })),
            Effect.catch(() => Effect.succeed(undefined)),
          );
        }),
      };
    }),
  );
