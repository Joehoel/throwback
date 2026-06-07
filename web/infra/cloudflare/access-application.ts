import * as zeroTrust from "@distilled.cloud/cloudflare/zero-trust";
import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type { AccessProviders } from "./collection.ts";

export interface AccessApplicationProps {
  /** Display name in the Zero Trust dashboard. Defaults to the domain. */
  name?: string;
  /** The hostname Access protects, e.g. `app.example.com`. */
  domain: string;
  /**
   * Application type. Only `self_hosted` is exercised here (the shape that
   * fronts a Worker/origin behind Access).
   *
   * @default "self_hosted"
   */
  type?: "self_hosted";
  /** Token lifetime for sessions to this app (e.g. `24h`). */
  sessionDuration?: string;
  /**
   * Reusable {@link AccessPolicy} ids to attach, in evaluation order. Pass
   * `policy.policyId` outputs — the engine resolves them before reconcile.
   */
  policyIds: string[];
}

/**
 * A self-hosted Cloudflare Access (Zero Trust) application — the edge gate in
 * front of a hostname. On its own it does nothing; attach reusable
 * {@link AccessPolicy} ids via {@link AccessApplicationProps.policyIds} to
 * decide who (or which IPs) may reach the origin.
 *
 * @example Gate a domain to a home-IP allow policy
 * ```typescript
 * const home = yield* AccessPolicy("HomeOnly", {
 *   name: "Home IP only",
 *   decision: "allow",
 *   include: [{ ip: { ip: "203.0.113.7/32" } }],
 * });
 * yield* AccessApplication("Lock", {
 *   domain: "app.example.com",
 *   policyIds: [home.policyId],
 * });
 * ```
 */
export type AccessApplication = Resource<
  "Cloudflare.Access.Application",
  AccessApplicationProps,
  {
    applicationId: string;
    accountId: string;
    name: string;
    domain: string;
    aud: string | undefined;
  },
  never,
  AccessProviders
>;

export const AccessApplication = Resource<AccessApplication>("Cloudflare.Access.Application");

export const AccessApplicationProvider = () =>
  Provider.effect(
    AccessApplication,
    Effect.gen(function* () {
      const { accountId } = yield* CloudflareEnvironment;
      const create = yield* zeroTrust.createAccessApplicationForAccount;
      const get = yield* zeroTrust.getAccessApplicationForAccount;
      const update = yield* zeroTrust.updateAccessApplicationForAccount;
      const remove = yield* zeroTrust.deleteAccessApplicationForAccount;
      const list = zeroTrust.listAccessApplicationsForAccount;

      // Resolve the app id for a domain. We extract just the id (a plain
      // string) rather than returning the whole list item: the get-response and
      // list-item shapes are redundant, separately-emitted copies (distilled
      // #175), so unifying them in one variable trips TS. `domain` is
      // variant-specific, so narrow with the `in` operator; `id` is common.
      const findIdByDomain = (domain: string) =>
        list.items({ accountId }).pipe(
          Stream.filter((app) => "domain" in app && app.domain === domain),
          Stream.runHead,
          Effect.map((head) => Option.getOrUndefined(head)?.id ?? undefined),
        );

      return {
        stables: ["applicationId", "accountId"],
        reconcile: Effect.fn(function* ({ news, output }) {
          // Observe — cached id first, then fall back to a domain lookup to
          // recover from out-of-band deletes or lost state. Keep this as a
          // plain `string | undefined` id so we never merge two response types.
          const observedId = output?.applicationId
            ? yield* get({ accountId, appId: output.applicationId }).pipe(
                Effect.map((app) => app.id ?? undefined),
                Effect.catch(() => Effect.succeed(undefined)),
              )
            : undefined;
          const existingId = observedId ?? (yield* findIdByDomain(news.domain));

          const name = news.name ?? news.domain;
          const common = {
            name,
            domain: news.domain,
            type: news.type ?? ("self_hosted" as const),
            sessionDuration: news.sessionDuration,
            // Attach reusable policies by id reference, in declared order
            // (array position sets precedence). The request union's bare
            // `string` member is exactly a policy-id reference. `id`/`aud` are
            // common to every response variant; `domain`/`name` come from
            // props, so we never read them back off the response union.
            policies: news.policyIds,
          };

          // Ensure/sync — update in place when present (pushes policy +
          // settings drift), else create.
          const app = existingId
            ? yield* update({ accountId, appId: existingId, ...common })
            : yield* create({ accountId, ...common });

          return {
            applicationId: app.id!,
            accountId,
            name,
            domain: news.domain,
            aud: app.aud ?? undefined,
          };
        }),
        delete: Effect.fn(function* ({ output }) {
          yield* remove({
            accountId: output.accountId,
            appId: output.applicationId,
          }).pipe(Effect.catch(() => Effect.void));
        }),
        read: Effect.fn(function* ({ output }) {
          if (!output?.applicationId) return undefined;
          return yield* get({
            accountId: output.accountId,
            appId: output.applicationId,
          }).pipe(
            Effect.map((app) => ({
              applicationId: app.id ?? output.applicationId,
              accountId: output.accountId,
              name: output.name,
              domain: output.domain,
              aud: app.aud ?? output.aud,
            })),
            Effect.catch(() => Effect.succeed(undefined)),
          );
        }),
      };
    }),
  );
