import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import { AccessApplication, AccessApplicationProvider } from "./access-application.ts";
import { AccessPolicy, AccessPolicyProvider } from "./access-policy.ts";
import { AccessProviders } from "./collection.ts";

export { AccessProviders };

/**
 * A second provider collection holding our custom Cloudflare Access resources.
 *
 * The reconcile engine resolves a resource's provider by scanning every
 * `ProviderCollection` in context (`alchemy/Provider` `tryFindProviderByType`),
 * so this collection composes alongside `Cloudflare.providers()` without
 * forking its catalog. Compose it in the stack as:
 *
 * ```typescript
 * providers: accessProviders().pipe(Layer.provideMerge(Cloudflare.providers()))
 * ```
 *
 * `provideMerge` feeds Cloudflare's credentials / environment / retry (which it
 * `provideMerge`s into its own output) into these providers, satisfying the
 * `zeroTrust.*` calls they make.
 */
export const accessProviders = () =>
  Layer.effect(AccessProviders, Provider.collection([AccessPolicy, AccessApplication])).pipe(
    Layer.provide(Layer.mergeAll(AccessPolicyProvider(), AccessApplicationProvider())),
  );
