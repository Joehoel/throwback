import { env } from "cloudflare:workers";
import { Effect, Layer } from "effect";
import { LibraryIndexDispatcher } from "./library-index-dispatcher.ts";
import type { LibraryIndexDispatcherService } from "./library-index-dispatcher.ts";
import { LibraryIndexUnavailable } from "./errors.ts";

/** Minimal Cloudflare service-binding surface used by the server-only dispatcher. */
export interface LibraryIndexWorkerBinding {
  readonly fetch: (input: Request) => Promise<Response>;
}

function unavailable(): LibraryIndexUnavailable {
  return new LibraryIndexUnavailable({
    message: "De duurzame Bibliotheek-index kon niet worden gestart.",
  });
}

/** Cloudflare service-binding adapter for the private index Worker. */
function makeServiceBindingLibraryIndexDispatcher(
  worker: LibraryIndexWorkerBinding,
): LibraryIndexDispatcherService {
  const dispatch = Effect.fn("LibraryIndexDispatcher.dispatch")(function* (
    input: Parameters<LibraryIndexDispatcherService["dispatch"]>[0],
  ) {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        worker.fetch(
          new Request("https://library-index.internal/runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
            signal,
          }),
        ),
      catch: unavailable,
    });

    if (!response.ok) {
      yield* Effect.fail(unavailable());
    }
  });

  return { dispatch };
}

/** Production dispatcher backed by the private Cloudflare Worker service binding. */
export const ServiceBindingLibraryIndexDispatcherLive = Layer.succeed(
  LibraryIndexDispatcher,
  makeServiceBindingLibraryIndexDispatcher(env.LIBRARY_INDEXER),
);
