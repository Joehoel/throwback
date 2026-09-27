import { Duration, Effect, Schedule, Schema } from "effect";
import type { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

export const GraphRequestOperation = Schema.Literals(["download", "metadata", "photo-details"]);

export type GraphRequestOperation = typeof GraphRequestOperation.Type;

/** Internal retry signal for one idempotent Graph request attempt. */
export class GraphRequestRetry extends Schema.TaggedError<GraphRequestRetry>()(
  "GraphRequestRetry",
  {
    operation: GraphRequestOperation,
    status: Schema.NullOr(Schema.Int),
    retryAfterMilliseconds: Schema.NullOr(Schema.Int),
    retryable: Schema.Boolean,
  },
) {}

/** Four-total-attempt Graph budget with jitter and bounded Retry-After support. */
export const graphRetrySchedule = Schedule.exponential("1 second", 4).pipe(
  Schedule.jittered,
  Schedule.setInputType<GraphRequestRetry>(),
  Schedule.modifyDelay(({ duration, input }) =>
    Effect.succeed(
      input.retryAfterMilliseconds === null
        ? duration
        : Duration.millis(input.retryAfterMilliseconds),
    ),
  ),
  Schedule.while(({ input }) => input.retryable),
  Schedule.upTo({ times: 3 }),
);

/** Normalize a transport failure without retaining provider or resource details. */
export function graphTransportFailure(operation: GraphRequestOperation): GraphRequestRetry {
  return new GraphRequestRetry({
    operation,
    status: null,
    retryAfterMilliseconds: null,
    retryable: true,
  });
}

function retryAfterMilliseconds(response: HttpClientResponse.HttpClientResponse): number | null {
  const value = response.headers["retry-after"];

  if (!/^\d+$/u.test(value)) {
    return null;
  }

  return Number(value) * 1000;
}

/** Fail only statuses covered by the automatic Graph retry policy. */
export function retryableGraphResponse(
  operation: GraphRequestOperation,
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<HttpClientResponse.HttpClientResponse, GraphRequestRetry> {
  const retryAfter = response.status === 429 ? retryAfterMilliseconds(response) : null;

  const retryableStatus =
    response.status === 408 || response.status === 429 || response.status >= 500;

  if (!retryableStatus) {
    return Effect.succeed(response);
  }

  return Effect.fail(
    new GraphRequestRetry({
      operation,
      status: response.status,
      retryAfterMilliseconds: retryAfter,
      retryable: retryAfter === null || retryAfter <= 15 * 60 * 1000,
    }),
  );
}

interface ExecuteGraphRequest {
  readonly client: HttpClient.HttpClient;
  readonly operation: GraphRequestOperation;
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly retry: boolean;
}

/** Execute one privacy-safe Graph request with the declared attempt budget. */
export function executeGraphRequest(input: ExecuteGraphRequest) {
  const attempt = input.client.execute(input.request).pipe(
    Effect.withTracerEnabled(false),
    Effect.mapError(() => graphTransportFailure(input.operation)),
    Effect.flatMap((response) => retryableGraphResponse(input.operation, response)),
  );

  return input.retry ? attempt.pipe(Effect.retry(graphRetrySchedule)) : attempt;
}
