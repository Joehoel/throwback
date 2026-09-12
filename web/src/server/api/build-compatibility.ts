import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { BUILD_ID } from "../config/build-id.ts";
import { BuildCompatibility, BuildUpgradeRequired } from "./contract.ts";

export const BUILD_ID_HEADER = "x-throwback-build-id";

export const requireCurrentBuild = Effect.fnUntraced(function* (
  receivedBuildId: string | undefined,
) {
  if (receivedBuildId !== BUILD_ID) {
    return yield* new BuildUpgradeRequired({
      currentBuildId: BUILD_ID,
      message: "Deze versie van de Beheer-webapp is verouderd. Laad de pagina opnieuw.",
    });
  }

  return yield* Effect.void;
});

export const BuildCompatibilityLive = Layer.succeed(BuildCompatibility)(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;

    yield* requireCurrentBuild(request.headers[BUILD_ID_HEADER]);

    return yield* httpEffect;
  }),
);
