import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { CuratorAccess } from "../curator/curator-access.ts";
import type { SignedInMicrosoftAccount as SignedInMicrosoftAccountValue } from "../curator/model.ts";
import { LibrarySetup } from "../library/library-setup.ts";
import {
  CuratorAuthorization,
  SignedInMicrosoftAccount,
  SignedInSessionAuthorization,
} from "./authentication.ts";
import { BuildCompatibilityLive } from "./build-compatibility.ts";
import { LibraryIndexing, ThrowbackApi } from "./contract.ts";

const BootstrapHandlers = HttpApiBuilder.group(
  ThrowbackApi,
  "bootstrap",
  Effect.fnUntraced(function* (handlers) {
    const access = yield* CuratorAccess;

    return handlers.handle(
      "getBootstrap",
      Effect.fn("BootstrapApi.getBootstrap")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return yield* access.bootstrap(new Headers(request.headers));
      }),
    );
  }),
);

const CuratorHandlers = HttpApiBuilder.group(
  ThrowbackApi,
  "curator",
  Effect.fnUntraced(function* (handlers) {
    const access = yield* CuratorAccess;

    return handlers.handle(
      "claimCurator",
      Effect.fn("CuratorApi.claimCurator")(function* () {
        const account = yield* SignedInMicrosoftAccount;

        return yield* access.claim(account);
      }),
    );
  }),
);

const LibraryHandlers = HttpApiBuilder.group(
  ThrowbackApi,
  "library",
  Effect.fnUntraced(function* (handlers) {
    const setup = yield* LibrarySetup;

    return handlers
      .handle(
        "listLibraryFolders",
        Effect.fn("LibraryApi.listLibraryFolders")(function* ({ query }) {
          const account = yield* SignedInMicrosoftAccount;

          return yield* setup.browseFolders(account, Option.fromNullishOr(query.parentFolderId));
        }),
      )
      .handle(
        "selectLibrary",
        Effect.fn("LibraryApi.selectLibrary")(function* ({ payload }) {
          const account = yield* SignedInMicrosoftAccount;
          const selection = yield* setup.selectLibrary(account, payload.rootFolderId);

          return LibraryIndexing.make({
            libraryId: selection.library.id,
            rootFolder: selection.library.root,
            progress: selection.progress,
          });
        }),
      );
  }),
);

const SignedInSessionAuthorizationLive = Layer.effect(
  SignedInSessionAuthorization,
  Effect.gen(function* () {
    const access = yield* CuratorAccess;

    return Effect.fnUntraced(function* (httpEffect) {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const account = yield* access.requireSignedIn(new Headers(request.headers));

      return yield* httpEffect.pipe(
        Effect.provideService(
          SignedInMicrosoftAccount,
          account satisfies SignedInMicrosoftAccountValue,
        ),
      );
    });
  }),
);

const CuratorAuthorizationLive = Layer.effect(
  CuratorAuthorization,
  Effect.gen(function* () {
    const access = yield* CuratorAccess;

    return Effect.fnUntraced(function* (httpEffect) {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const account = yield* access.requireCurator(new Headers(request.headers));

      return yield* httpEffect.pipe(
        Effect.provideService(
          SignedInMicrosoftAccount,
          account satisfies SignedInMicrosoftAccountValue,
        ),
      );
    });
  }),
);

const DocsRoute = HttpApiScalar.layer(ThrowbackApi, { path: "/docs" }).pipe(
  Layer.provide(HttpServer.layerServices),
);

const { handler: docsHandler } = HttpRouter.toWebHandler(DocsRoute);

const domainMount = "/api/domain";

const apiMount = "/api";

function rerouteRequest(request: Request, mount: string): Request {
  const url = new URL(request.url);

  url.pathname = url.pathname.slice(mount.length) || "/";

  return new Request(url, request);
}

/** Build the domain handler with one concrete Curator access implementation. */
export function createDomainRequestHandler(
  applicationLayer: Layer.Layer<CuratorAccess | LibrarySetup>,
): (request: Request) => Promise<Response> {
  const routes = HttpApiBuilder.layer(ThrowbackApi).pipe(
    Layer.provide([BootstrapHandlers, CuratorHandlers, LibraryHandlers]),
    Layer.provide(SignedInSessionAuthorizationLive),
    Layer.provide(CuratorAuthorizationLive),
    Layer.provide(applicationLayer),
    Layer.provide(BuildCompatibilityLive),
    Layer.provide(HttpServer.layerServices),
  );

  const { handler } = HttpRouter.toWebHandler(routes);

  return (request) => handler(rerouteRequest(request, domainMount));
}

/** Serve the generated API documentation under the `/api` mount. */
export function handleDocsRequest(request: Request): Promise<Response> {
  return docsHandler(rerouteRequest(request, apiMount));
}
