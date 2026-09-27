import { Duration, Effect, Schedule } from "effect";
import { isSqlError } from "effect/unstable/sql/SqlError";

/** Three-total-attempt policy for interactive D1 operations. */
export function retryInteractiveSql<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.exponential("50 millis", 4).pipe(Schedule.jittered),
      while: (error) => isSqlError(error) && error.isRetryable,
    }),
  );
}

/** Five-total-attempt policy for durable background checkpoints. */
export function retryBackgroundSql<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.retry({
      times: 4,
      schedule: Schedule.exponential("1 second", 4).pipe(
        Schedule.jittered,
        Schedule.modifyDelay(({ duration }) =>
          Effect.succeed(Duration.min(duration, Duration.seconds(60))),
        ),
      ),
      while: (error) => isSqlError(error) && error.isRetryable,
    }),
  );
}
