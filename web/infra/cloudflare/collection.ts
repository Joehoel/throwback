import * as Provider from "alchemy/Provider";

/**
 * Provider collection that owns our custom Cloudflare Access resources. Each
 * Access resource names this as its 5th `Resource` type param so the engine
 * (and the type system) resolves their providers from here rather than
 * demanding standalone `Provider<R>` tags in the stack context.
 *
 * Lives in its own file so the resource modules can `import type` it without a
 * runtime cycle through {@link file://./providers.ts}.
 */
export class AccessProviders extends Provider.ProviderCollection<AccessProviders>()(
  "ThrowbackAccess",
) {}
