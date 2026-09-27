import { AlchemyContext } from "alchemy";
import { task, Worker, WorkerEnvironment, Workflow, WorkflowEvent } from "alchemy/Cloudflare";
import { Config, Effect, Predicate, Redacted, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { LOCAL_URL, PREVIEW_URL, PreviewBetterAuthSecret, PreviewDB } from "./infrastructure.ts";
import { LibraryIndexWorkflowInput } from "./src/server/library/library-index-dispatcher.ts";
import { IndexWorkflowInstanceId } from "./src/server/library/library-index-model.ts";
import {
  processLibraryIndexPage,
  recordLibraryIndexDispatch,
} from "./src/server/library/library-index-runtime.ts";

function isD1Database(input: unknown): input is D1Database {
  return (
    Predicate.isObject(input) &&
    Predicate.hasProperty(input, "prepare") &&
    Predicate.isFunction(input.prepare) &&
    Predicate.hasProperty(input, "batch") &&
    Predicate.isFunction(input.batch)
  );
}

const RuntimeEnvironment = Schema.Struct({
  DB: Schema.declare(isD1Database),
  BETTER_AUTH_URL: Schema.NonEmptyString,
  MICROSOFT_CALLBACK_URL: Schema.NonEmptyString,
  MICROSOFT_CLIENT_ID: Schema.NonEmptyString,
  MICROSOFT_CLIENT_SECRET: Schema.NonEmptyString,
  BETTER_AUTH_SECRET: Schema.NonEmptyString,
});

const indexRuntimeOptions = Effect.fn("LibraryIndexWorker.runtimeOptions")(function* () {
  const rawEnvironment = yield* WorkerEnvironment;

  const environment = yield* Schema.decodeUnknownEffect(RuntimeEnvironment)(rawEnvironment).pipe(
    Effect.orDie,
  );

  return {
    database: environment.DB,
    betterAuthUrl: environment.BETTER_AUTH_URL,
    callbackUrl: environment.MICROSOFT_CALLBACK_URL,
    microsoftClientId: environment.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: Redacted.make(environment.MICROSOFT_CLIENT_SECRET),
    betterAuthSecret: Redacted.make(environment.BETTER_AUTH_SECRET),
  };
});

export class LibraryIndexWorkflow extends Workflow<LibraryIndexWorkflow>()(
  "LibraryIndexWorkflow",
  Effect.succeed(
    Effect.fn("LibraryIndexWorkflow.run")(function* (input: LibraryIndexWorkflowInput) {
      const event = yield* WorkflowEvent;
      const workflowInstanceId = IndexWorkflowInstanceId.make(event.instanceId);
      const options = yield* indexRuntimeOptions();
      let pageNumber = 0;
      let shouldContinue = true;

      yield* Effect.whileLoop({
        while: () => shouldContinue,
        body: () =>
          task(
            `delta-page-${pageNumber}`,
            processLibraryIndexPage(options, input, workflowInstanceId),
          ),
        step: (result) => {
          pageNumber += 1;
          shouldContinue = result === "continue";
        },
      });
    }),
  ),
) {}

export class LibraryIndexWorker extends Worker<LibraryIndexWorker>()(
  "LibraryIndexWorker",
  Effect.gen(function* () {
    const { dev } = yield* AlchemyContext;
    const baseUrl = dev ? LOCAL_URL : PREVIEW_URL;

    return {
      name: "throwback-library-index-preview",
      main: import.meta.filename,
      url: false,
      compatibility: {
        date: "2026-06-02",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: PreviewDB,
        BETTER_AUTH_SECRET: PreviewBetterAuthSecret,
        BETTER_AUTH_URL: baseUrl,
        MICROSOFT_CLIENT_ID: "0bb9b8c8-a9e6-475d-b44f-74521e46aaf1",
        MICROSOFT_CLIENT_SECRET: Config.Redacted("MICROSOFT_CLIENT_SECRET"),
        MICROSOFT_CALLBACK_URL: `${baseUrl}/api/auth/callback/microsoft`,
      },
    };
  }),
  Effect.gen(function* () {
    const workflow = yield* LibraryIndexWorkflow;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url);

        if (request.method !== "POST" || url.pathname !== "/runs") {
          return HttpServerResponse.empty({ status: 404 });
        }

        const input = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(LibraryIndexWorkflowInput)),
          Effect.orDie,
        );

        const instance = yield* workflow
          .create({ id: input.runId, params: input })
          .pipe(Effect.catchCause(() => workflow.get(input.runId)));

        const workflowInstanceId = IndexWorkflowInstanceId.make(instance.id);

        const options = yield* indexRuntimeOptions();

        yield* recordLibraryIndexDispatch(options.database, input.runId, workflowInstanceId);

        return HttpServerResponse.empty({ status: 202 });
      }),
    };
  }),
) {}
